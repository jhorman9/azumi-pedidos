import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID, createECDH, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, existsSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import vm from "node:vm";

// Integration tests use their own production server and disposable SQLite database.
const directory=mkdtempSync(path.join(tmpdir(),"azumi-test-"));
const socket=net.createServer();
await new Promise(resolve=>socket.listen(0,"127.0.0.1",resolve));
const port=socket.address().port;
await new Promise(resolve=>socket.close(resolve));
const base=`http://localhost:${port}`;
let serverOutput="";
function startServer(){
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p",String(port)],{cwd:process.cwd(),env:{...process.env,AZUMI_DATABASE_DRIVER:"sqlite",AZUMI_MYSQL_HOST:"",AZUMI_DATABASE_URL:"",AZUMI_DATABASE_PATH:path.join(directory,"azumi.sqlite"),AZUMI_ADMIN_EMAIL:"admin@test.azumi",AZUMI_ADMIN_PASSWORD:"azumi-test-password-2026",AZUMI_SMTP_HOST:"",AZUMI_GEOAPIFY_API_KEY:"",AZUMI_APP_URL:base,AZUMI_VAPID_PUBLIC_KEY:"",AZUMI_VAPID_PRIVATE_KEY:""},stdio:["ignore","pipe","pipe"]});
  server.stdout.on("data",data=>{serverOutput+=data;});server.stderr.on("data",data=>{serverOutput+=data;});
  return server;
}
let child=startServer();
const cookieJars={customer:new Map(),other:new Map(),admin:new Map(),device:new Map(),guest:new Map()};
async function request(who,method="GET",payload,expected=200,extraHeaders={},endpoint="/api/azumi") {
  const jar=cookieJars[who];
  const response=await fetch(base+endpoint,{method,headers:{...payload?{"Content-Type":"application/json"}:{},Cookie:[...jar].map(([k,v])=>k+"="+v).join("; "),Origin:base,...extraHeaders},body:payload?JSON.stringify(payload):undefined});
  for(const entry of response.headers.getSetCookie()){const [cookie]=entry.split(";"), separator=cookie.indexOf("=");jar.set(cookie.slice(0,separator),cookie.slice(separator+1));}
  const data=await response.json();
  assert.equal(response.status,expected,JSON.stringify(data));
  return data;
}
let passed=0;
async function check(name,action){await action();passed++;console.log(`✓ ${name}`);}
const orderPayload=(overrides={})=>({action:"order",requestKey:randomUUID(),items:[{productId:"arroz",qty:2,variant:"Combinación",extras:[{name:"Lumpia",cost:0}],unit:0,notes:"Sin cebolla"}],fulfillment:"pickup",point:null,address:"",coupon:"AZUMI10",expectedTotal:26.08,...overrides,customer:{name:"Cliente de prueba",phone:"60000000",whatsappPhone:"6123 4567",payment:"Efectivo",cash:50,...overrides.customer}});

try {
  let ready=false;
  for(let i=0;i<120;i++) {
    if(child.exitCode!==null)throw new Error(serverOutput);
    try{if((await fetch(base+"/api/azumi")).ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.ok(ready,"Test server did not become ready: "+serverOutput);
  let initial, created, admin, pushPublicKey;
  await check("Cuenta obligatoria protege tienda, catálogo y pedidos",async()=>{
    const publicData=await request("guest");assert.equal(publicData.products.length,0);assert.equal(publicData.orders.length,0);
    await request("guest","POST",orderPayload(),401);
    const page=await fetch(base+"/menu",{redirect:"manual"});
    if(page.status===307)assert.equal(page.headers.get("location"),"/cuenta");else {assert.equal(page.status,200);assert.match(await page.text(),/NEXT_REDIRECT|http-equiv="refresh"/);}
    await request("customer","POST",{action:"register",email:"cliente@test.azumi",password:"customer-test-password-2026",name:"Cliente registrado"},200,{},"/api/customer");
    await request("other","POST",{action:"register",email:"otro@test.azumi",password:"other-test-password-2026",name:"Otro cliente"},200,{},"/api/customer");
  });
  await check("Menú e imágenes cargan desde Next.js",async()=>{
    initial=await request("customer");assert.equal(initial.products.length,7);assert.equal(initial.admin,false);assert.equal(initial.development,false);
    assert.equal((await fetch(base+"/images/products/sushi.jpg")).status,200);
    const html=await (await fetch(base,{headers:{Cookie:[...cookieJars.customer].map(([k,v])=>k+"="+v).join("; ")}})).text();assert.match(html,/Azumi/);assert.match(html,/Arroz Frito/);assert.doesNotMatch(html,/azumi\/app.js/);
  });
  await check("Administración rechaza escritura sin sesión",async()=>{
    await request("customer","PATCH",{action:"catalog",revision:initial.revision,changes:{settings:initial.settings}},401);
    await request("admin","POST",{action:"login",email:"admin@test.azumi",password:"incorrecta"},401);
  });
  await check("Servidor rechaza precios y variantes manipulados",async()=>{
    await request("customer","POST",orderPayload({expectedTotal:0.01}),409);
    await request("customer","POST",orderPayload({items:[{productId:"arroz",qty:1,variant:"inventada",extras:[]}]}),409);
    await request("customer","POST",orderPayload({items:[{productId:"arroz",qty:0,variant:"Combinación",extras:[]}]}),400);
    await request("customer","POST",orderPayload({items:[{productId:"arroz",qty:2,variant:"Combinación",extras:[{name:"Lumpia"},{name:"Lumpia"}]}]}),400);
  });
  await check("WhatsApp separado es obligatorio y valida formato",async()=>{
    for(const whatsappPhone of [undefined,"","abc61234567","123","+01234567890","1234567890123456","6123+4567","+61234567"]){
      const rejected=await request("customer","POST",orderPayload({customer:{whatsappPhone}}),400);assert.match(rejected.error,/WhatsApp/);
    }
  });
  const original=orderPayload();
  await check("Pedido calcula variantes, extras y cupón en servidor",async()=>{
    created=(await request("customer","POST",original,201)).order;
    assert.equal(created.totals.subtotal,28.98);assert.equal(created.totals.discount,2.9);assert.equal(created.totals.total,26.08);assert.equal(created.items[0].unit,14.49);assert.equal(created.paymentStatus,"Pendiente");assert.equal(created.customer.whatsappPhone,"50761234567");assert.equal(created.customer.phone,"60000000");
  });
  await check("Reintentar el pedido no lo duplica",async()=>{
    const retried=(await request("customer","POST",original,201)).order;assert.equal(retried.id,created.id);assert.equal((await request("customer")).orders.length,1);
  });
  await check("Otro cliente no puede ver el pedido",async()=>{
    const other=await request("other");assert.equal(other.orders.length,0);assert.equal(other.adminOrders,undefined);assert.equal((await request("customer")).orders[0].id,created.id);
  });
  await check("Delivery valida exclusiones, mínimos y cobertura",async()=>{
    await request("customer","POST",orderPayload({fulfillment:"delivery",point:[320,140],address:"San Francisco",customer:{name:"Prueba",phone:"60000000",building:"Casa 1",payment:"Efectivo",cash:50},expectedTotal:28.08}),409);
    await request("customer","POST",orderPayload({fulfillment:"delivery",point:[0,0],address:"Sin cobertura"}),409);
    await request("customer","POST",orderPayload({fulfillment:"delivery",point:[12,48],pointSystem:"wgs84",address:"Fuera de Panamá"}),409);
    await request("customer","POST",orderPayload({fulfillment:"delivery",point:[495,170],items:[{productId:"arroz",qty:1,variant:"Combinación",extras:[]}],coupon:"",expectedTotal:17.99}),409);
    const delivered=(await request("customer","POST",orderPayload({fulfillment:"delivery",point:[270,210],address:"San Francisco, Calle 72",customer:{name:"Prueba",phone:"60000000",building:"Casa 1",payment:"Efectivo",cash:50},expectedTotal:28.08}),201)).order;
    assert.equal(delivered.zone,"San Francisco");assert.equal(delivered.totals.delivery,2);
  });
  await check("Pago al recibir valida efectivo y rechaza cobros simulados",async()=>{
    await request("customer","POST",orderPayload({customer:{name:"Prueba",phone:"60000000",payment:"Efectivo",cash:1}}),400);
    await request("customer","POST",orderPayload({customer:{name:"Prueba",phone:"60000000",payment:"Tarjeta"}}),400);
  });
  await check("Sesión administrativa usa cookie HttpOnly",async()=>{
    await request("admin","POST",{action:"login",email:"admin@test.azumi",password:"azumi-test-password-2026"});
    assert.ok(cookieJars.admin.get("azumi_admin"));admin=await request("admin");assert.equal(admin.admin,true);assert.equal(admin.orders.length,0);assert.equal(admin.adminOrders.length,2);
    const response=await fetch(base+"/api/azumi",{headers:{Cookie:[...cookieJars.customer].map(([k,v])=>k+"="+v).join("; ")}});assert.match(response.headers.get("set-cookie"),/HttpOnly/i);
  });
  await check("Estado del panel llega al seguimiento del cliente",async()=>{
    await request("admin","PATCH",{action:"status",id:created.id,status:"Entregado",previousStatus:"Recibido"},409);
    await request("admin","PATCH",{action:"status",id:created.id,status:"Confirmado",previousStatus:"Recibido"});
    assert.equal((await request("customer")).orders[0].status,"Confirmado");
    await request("admin","PATCH",{action:"status",id:created.id,status:"Cancelado",previousStatus:"Recibido"},409);
    await request("admin","PATCH",{action:"status",id:created.id,status:"Entregado",previousStatus:"Confirmado"},409);
    await request("admin","PATCH",{action:"status",id:created.id,status:"En preparación",previousStatus:"Confirmado"});assert.equal((await request("customer")).orders[0].status,"En preparación");
    await request("admin","PATCH",{action:"status",id:created.id,status:"Listo",previousStatus:"En preparación"});assert.equal((await request("customer")).orders[0].status,"Listo");
    await request("admin","PATCH",{action:"status",id:created.id,status:"Entregado",previousStatus:"Listo"});
    await request("admin","PATCH",{action:"status",id:created.id,status:"Recibido",previousStatus:"Entregado"},409);
  });
  await check("Catálogo persiste cambios y preserva pedidos históricos",async()=>{
    admin=await request("admin");const products=structuredClone(admin.products);products[0].price=15;
    await request("admin","PATCH",{action:"catalog",revision:admin.revision,changes:{products}});
    const customer=await request("customer");assert.equal(customer.products[0].price,15);assert.equal(customer.orders[0].items[0].unit,14.49);
    await request("admin","PATCH",{action:"catalog",revision:admin.revision,changes:{products}},409);
    await request("customer","POST",orderPayload(),409);
  });
  await check("Configuración y validación del catálogo funcionan",async()=>{
    admin=await request("admin");
    await request("admin","PATCH",{action:"catalog",revision:admin.revision,changes:{coupons:[{id:"bad",code:"BAD",percent:101,min:0,active:true}]}},400);
    await request("admin","PATCH",{action:"catalog",revision:admin.revision,changes:{zones:[{...admin.zones[0],points:[[0,0],[100,100],[0,100],[100,0]]}]}},400);
    await request("admin","PATCH",{action:"catalog",revision:admin.revision,changes:{settings:{...admin.settings,restaurantOpen:false}}});
    await request("customer","POST",orderPayload(),409);
  });
  await check("Solicitud desde otro origen es rechazada",async()=>{await request("admin","PATCH",{action:"status",id:created.id,status:"Recibido"},403,{Origin:"https://example.invalid"});});

  await check("Páginas de Next.js renderizan sin el montaje HTML anterior",async()=>{
    async function page(who,pathname){
      const cookie=[...cookieJars[who]].map(([key,value])=>key+"="+value).join("; ");
      const response=await fetch(base+pathname,{headers:{Cookie:cookie},redirect:"manual"});
      assert.equal(response.status,200,pathname);
      const html=await response.text();assert.match(html,/<h1|role="status"/);assert.equal(html.includes('azumi/app.js'),false,pathname);assert.equal(html.includes('data-action='),false,pathname);assert.equal(html.includes('href="#/'),false,pathname);
      return html;
    }
    const customerRoutes=['/','/menu','/categoria/Sushi','/favoritos','/producto/arroz','/carrito','/carrito/editar/0','/modalidad','/ubicacion','/checkout','/resumen',`/pedido/${created.id}`,`/confirmacion/${created.id}`,'/pedidos','/direcciones','/cuenta'];
    for(const route of customerRoutes)await page("customer",route);
    assert.match(await page("customer","/menu"),/Arroz Frito/);
    assert.match(await page("customer",`/pedido/${created.id}`),/Entregado/);
    const adminRoutes=['/admin','/admin/pedidos',`/admin/pedidos/${created.id}`,'/admin/productos','/admin/productos/arroz','/admin/productos/nuevo','/admin/categorias','/admin/categorias/cat0','/admin/categorias/nuevo','/admin/promociones','/admin/promociones/promo1','/admin/promociones/nuevo','/admin/clientes','/admin/delivery','/admin/delivery/sf','/admin/delivery/nuevo','/admin/cupones','/admin/cupones/c1','/admin/cupones/nuevo','/admin/configuracion'];
    for(const route of adminRoutes)await page("admin",route);
    const contact=await page("admin",`/admin/pedidos/${created.id}`);assert.match(contact,/https:\/\/wa\.me\/50761234567/);assert.doesNotMatch(contact,/https:\/\/wa\.me\/50760000000/);
    const unauthenticated=await fetch(base+"/admin",{redirect:"manual"});
    if(unauthenticated.status===307)assert.equal(unauthenticated.headers.get("location"),"/admin/login");
    else {assert.equal(unauthenticated.status,200);const html=await unauthenticated.text();assert.match(html,/NEXT_REDIRECT|http-equiv="refresh"/);assert.match(html,/\/admin\/login/);assert.doesNotMatch(html,/Cliente de prueba|Todo bajo control/);}
    await page("other","/admin/login");
    assert.equal((await fetch(base+"/esta-pagina-no-existe")).status,404);
    assert.equal((await fetch(base+"/azumi/app.js")).status,404);
  });
  await check("Modelo React conserva cantidades y actualiza precios del carrito",async()=>{
    const typescript=await import("typescript");
    const compiled=typescript.transpileModule(readFileSync("lib/azumi-client.ts","utf8"),{compilerOptions:{module:typescript.ModuleKind.CommonJS,target:typescript.ScriptTarget.ES2020}}).outputText;
    const modules=new Map();
    function load(name){if(modules.has(name))return modules.get(name);const sandbox={exports:{},Intl,Date,structuredClone,require:dependency=>load(dependency.replace("./",""))};modules.set(name,sandbox.exports);const source=typescript.transpileModule(readFileSync(`lib/${name}.ts`,"utf8"),{compilerOptions:{module:typescript.ModuleKind.CommonJS,target:typescript.ScriptTarget.ES2020}}).outputText;vm.runInNewContext(source,sandbox);return sandbox.exports;}
    const sandbox={exports:{},Intl,Date,structuredClone,require:dependency=>load(dependency.replace("./",""))};vm.runInNewContext(compiled,sandbox);
    const model=sandbox.exports,current=await request("admin"),product=current.products.find(p=>p.id==="arroz");
    const item=model.createItem(product,"Combinación",["Lumpia"],2,"Sin cebolla");assert.equal(item.unit,16.5);assert.equal(item.qty,2);
    const updated=model.reconcileCart(created.items,current);assert.equal(updated[0].unit,16.5);assert.equal(updated[0].qty,2);
    const personal={...model.emptyPersonal,cart:updated,fulfillment:"pickup",coupon:"AZUMI10"};assert.equal(model.cartTotals(current,personal).total,29.7);
    const rounding={...current,coupons:[{code:"HALF",active:true,min:0,percent:50}]};assert.equal(model.cartTotals(rounding,{...personal,coupon:"HALF"},[{unit:0.29,qty:1}]).discount,0.15);
    const unavailable=structuredClone(current);unavailable.products.find(p=>p.id==="arroz").active=false;assert.equal(model.reconcileCart(updated,unavailable)[0].unavailable,true);
  });
  await check("Geoapify protege clave, valida resultados, limita consultas y conserva coordenadas",async()=>{
    const ts=await import("typescript"),compile=file=>ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    const parser={exports:{}};vm.runInNewContext(compile("lib/location-results.ts"),parser);
    const payload={results:[{place_id:"ph-test",formatted:"PH Pacific Test, Calle 72, Panama",name:"PH Pacific Test",result_type:"building",lat:9.01,lon:-79.5},{formatted:"Bad",lat:99,lon:-79},{formatted:"Bad",lat:null,lon:-79}]};
    const parsed=parser.exports.geoapifyResults(payload);assert.equal(parsed.length,1);assert.deepEqual(Array.from(parsed[0].point),[-79.5,9.01]);assert.equal(parsed[0].building,"PH Pacific Test");assert.throws(()=>parser.exports.geoapifyResults({error:"invalid"}));
    let signedIn=false,clock=100000,upstreamOK=true;const calls=[];
    const sandbox={exports:{},process:{env:{AZUMI_GEOAPIFY_API_KEY:"server-only-test-key"}},URL,URLSearchParams,AbortSignal,Date:{now:()=>clock},fetch:async url=>{calls.push(new URL(url));return {ok:upstreamOK,json:async()=>payload};},require:id=>{
      if(id==="next/server")return {NextResponse:{json:(data,options={})=>({data,status:options.status||200,headers:options.headers})}};
      if(id.includes("customer-store"))return {customerSession:async()=>signedIn?{owner:"customer-test"}:null};
      if(id.includes("location-results"))return parser.exports;
      throw Error(id);
    }};
    vm.runInNewContext(compile("app/api/locations/route.ts"),sandbox);
    const get=query=>sandbox.exports.GET({nextUrl:new URL("https://azumi.test/api/locations?"+query),cookies:{get:()=>({value:"test-session"})}});
    assert.equal((await get("q=Pacific")).status,401);assert.equal(calls.length,0);signedIn=true;
    const config=await get("mode=config");assert.equal(config.data.autocomplete,true);assert.equal(config.data.apiKey,undefined);
    assert.equal((await get("q=x")).status,400);
    const response=await get("q=Pacific&mode=autocomplete");assert.equal(response.status,200);assert.equal(response.data.provider,"geoapify");assert.equal(response.data.results[0].building,"PH Pacific Test");assert.equal(JSON.stringify(response.data).includes("server-only-test-key"),false);
    assert.equal(calls[0].pathname,"/v1/geocode/autocomplete");assert.equal(calls[0].searchParams.get("filter"),"countrycode:pa");assert.equal(calls[0].searchParams.get("apiKey"),"server-only-test-key");assert.equal(calls[0].searchParams.get("lang"),"es");
    await get("q=Pacific&mode=autocomplete");assert.equal(calls.length,1);
    assert.equal((await get("q=SanFrancisco&mode=search")).status,429);clock+=500;
    assert.equal((await get("q=SanFrancisco&mode=search")).status,200);assert.equal(calls[1].pathname,"/v1/geocode/search");
    clock+=500;upstreamOK=false;const failed=await get("q=OtroLugar");assert.equal(failed.status,503);assert.equal(JSON.stringify(failed.data).includes("server-only-test-key"),false);
    await request("guest","GET",undefined,401,{},"/api/locations?mode=config");
    const fallback=await request("customer","GET",undefined,200,{},"/api/locations?mode=config");assert.equal(fallback.autocomplete,false);
  });
  await check("Botones de la lista avanzan estados sin abrir el detalle",async()=>{
    const ts=await import("typescript"),React=await import("react"),jsx=await import("react/jsx-runtime");
    const compile=file=>ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const statuses={exports:{}};vm.runInNewContext(compile("lib/order-status.ts"),statuses);
    let busy=false;const changes=[];
    const store={get busy(){return busy;},run:action=>action(),changeStatus:async(order,status)=>changes.push([order.id,status])};
    const sandbox={exports:{},require:id=>{
      if(id==="react")return {...React,useState:value=>[value,()=>{}]};
      if(id==="react/jsx-runtime")return jsx;
      if(id.includes("azumi-provider"))return {useAzumi:()=>store};
      if(id.includes("azumi-client"))return {statusOptions:statuses.exports.statusOptions,money:()=>"",dateLabel:()=>""};
      return new Proxy({},{get:()=>()=>null});
    }};
    vm.runInNewContext(compile("components/admin/orders.tsx"),sandbox);
    function find(node){if(!React.isValidElement(node))return;if(node.type?.name==="AdvanceOrderButton")return node;for(const child of React.Children.toArray(node.props.children)){const result=find(child);if(result)return result;}}
    const cases=[["Recibido","pickup","Confirmado"],["Confirmado","pickup","En preparación"],["En preparación","pickup","Listo"],["Listo","pickup","Entregado"],["Listo","delivery","En camino"],["En camino","delivery","Entregado"]];
    for(const [status,fulfillment,next] of cases){
      const order={...created,status,fulfillment},table=sandbox.exports.OrdersTable({orders:[order],quickActions:true}),element=find(table),button=element.type(element.props);
      assert.equal(button.props.disabled,false);assert.match(button.props.title,new RegExp(next));await button.props.onClick();assert.equal(changes.at(-1)[1],next);
      busy=true;assert.equal(element.type(element.props).props.disabled,true);busy=false;
    }
    for(const status of ["Entregado","Cancelado"]){const element=find(sandbox.exports.OrdersTable({orders:[{...created,status}],quickActions:true}));assert.equal(element.type(element.props),null);}
    assert.equal(find(sandbox.exports.OrdersTable({orders:[created]})),undefined);
  });
  await check("Pagos y devoluciones requieren administrador y mantienen registro",async()=>{
    await request("customer","PATCH",{action:"payment",id:created.id,paymentStatus:"Pagado",previousPaymentStatus:"Pendiente",note:"Efectivo"},401);
    await request("admin","PATCH",{action:"payment",id:created.id,paymentStatus:"Devuelto",previousPaymentStatus:"Pendiente",note:"Prueba"},409);
    const paid=(await request("admin","PATCH",{action:"payment",id:created.id,paymentStatus:"Pagado",previousPaymentStatus:"Pendiente",note:"Efectivo recibido"})).order;assert.equal(paid.paymentStatus,"Pagado");assert.equal(paid.paymentHistory.length,1);
    await request("admin","PATCH",{action:"payment",id:created.id,paymentStatus:"Pagado",previousPaymentStatus:"Pendiente",note:"Repetido"},409);
    const refunded=(await request("admin","PATCH",{action:"payment",id:created.id,paymentStatus:"Devuelto",previousPaymentStatus:"Pagado",note:"Devolución completa"})).order;assert.equal(refunded.paymentStatus,"Devuelto");assert.equal(refunded.paymentHistory.length,2);
  });
  await check("Cuenta y direcciones recuperan historial desde otro dispositivo",async()=>{
    const endpoint="/api/customer",email="cliente@test.azumi",password="customer-test-password-2026";
    const registered=await request("customer","POST",{action:"login",email,password},200,{},endpoint);assert.equal(registered.customer.email,email);assert.equal(registered.customer.password,undefined);assert.equal((await request("customer")).orders.length,2);
    await request("customer","POST",{action:"profile",profile:{name:"Cliente",phone:"60000000",whatsappPhone:"+57 300 123 4567"},addresses:[{id:"home",label:"Casa",address:"Calle 72",point:[-79.5,9]}]},200,{},endpoint);
    assert.equal((await request("customer","GET",undefined,200,{},endpoint)).customer.profile.whatsappPhone,"573001234567");
    await request("device","POST",{action:"profile",profile:{name:"Intruso"},addresses:[]},401,{},endpoint);
    await request("device","POST",{action:"login",email,password:"wrong-password-2026"},401,{},endpoint);
    await request("device","POST",{action:"login",email,password},200,{},endpoint);assert.equal((await request("device")).orders.length,2);assert.equal((await request("device","GET",undefined,200,{},endpoint)).customer.addresses[0].label,"Casa");
    await request("device","POST",{action:"logout"},200,{},endpoint);assert.equal((await request("device")).orders.length,0);
    await request("device","POST",{action:"reset",token:"invalid",password},400,{},endpoint);
  });
  await check("Promociones vigentes cambian el precio validado en servidor",async()=>{
    admin=await request("admin");const promotion={...admin.promotions[0],id:"test-sale",product:"arroz",price:10,from:"00:00",to:"23:59",days:"0,1,2,3,4,5,6"};
    await request("admin","PATCH",{action:"catalog",revision:admin.revision,changes:{promotions:[...admin.promotions,promotion],settings:{...admin.settings,restaurantOpen:true}}});
    const payload=orderPayload({requestKey:randomUUID(),coupon:"",expectedTotal:23});const [first,second]=await Promise.all([request("other","POST",payload,201),request("other","POST",payload,201)]);assert.equal(first.order.id,second.order.id);assert.equal(first.order.items[0].unit,11.5);
    const current=await request("admin");await request("admin","PATCH",{action:"catalog",revision:current.revision,changes:{promotions:admin.promotions,settings:admin.settings}});
  });
  await check("Imágenes propias se guardan y se sirven desde la base de datos",async()=>{
    const form=new FormData();form.append("image",new Blob([readFileSync("public/images/products/sushi.jpg")],{type:"image/jpeg"}),"foto.jpg");
    const response=await fetch(base+"/api/media",{method:"POST",headers:{Origin:base,Cookie:[...cookieJars.admin].map(([k,v])=>k+"="+v).join("; ")},body:form});assert.equal(response.status,201);const uploaded=await response.json();assert.match(uploaded.image,/^\/api\/media\/[a-f0-9]{48}$/);const image=await fetch(base+uploaded.image);assert.equal(image.headers.get("content-type"),"image/webp");assert.ok((await image.arrayBuffer()).byteLength>100);
    const rejected=await fetch(base+"/api/media",{method:"POST",headers:{Origin:base},body:form});assert.equal(rejected.status,401);
  });
  await check("Push protege claves, destinatarios y endpoints por sesion",async()=>{
    const endpoint="/api/push";
    await request("guest","GET",undefined,401,{},endpoint);
    const keys=await request("customer","GET",undefined,200,{},endpoint);pushPublicKey=keys.publicKey;
    assert.equal(Buffer.from(pushPublicKey,"base64url").length,65);assert.equal(keys.privateKey,undefined);
    assert.equal((await request("admin","GET",undefined,200,{},endpoint+"?role=admin")).publicKey,pushPublicKey);
    await request("customer","GET",undefined,401,{},endpoint+"?role=admin");
    const curve=createECDH("prime256v1"),subscription={endpoint:`https://fcm.googleapis.com/fcm/send/azumi-test-${randomUUID()}`,keys:{p256dh:curve.generateKeys().toString("base64url"),auth:randomBytes(16).toString("base64url")}};
    await request("customer","POST",{action:"subscribe",subscription:{...subscription,endpoint:"https://127.0.0.1/internal"}},400,{},endpoint);
    await request("customer","POST",{action:"subscribe",subscription:{...subscription,keys:{p256dh:"bad",auth:"bad"}}},400,{},endpoint);
    await request("customer","POST",{action:"subscribe",subscription,owner:"restaurant"},200,{},endpoint);
    await request("customer","POST",{action:"unsubscribe",endpoint:subscription.endpoint},200,{},endpoint);
    await request("admin","POST",{action:"subscribe",subscription},200,{},endpoint+"?role=admin");
    await request("admin","POST",{action:"unsubscribe",endpoint:subscription.endpoint},200,{},endpoint+"?role=admin");
    await request("customer","POST",{action:"subscribe",subscription},403,{Origin:"https://example.invalid"},endpoint);
    const manifest=await (await fetch(base+"/manifest.webmanifest")).json();assert.equal(manifest.display,"standalone");assert.equal(manifest.icons.length,2);
    const worker=await (await fetch(base+"/sw.js")).text();assert.match(worker,/showNotification/);assert.match(worker,/notificationclick/);assert.match(worker,/azumi-order-update/);
  });
  await check("Acceso solo por correo y sin proveedores sociales",async()=>{
    for(const provider of ["google","facebook"]){
      assert.equal((await fetch(base+"/api/social/"+provider,{redirect:"manual"})).status,404);
      assert.equal((await fetch(base+"/api/social/"+provider+"/callback",{redirect:"manual"})).status,404);
    }
    const data=await request("customer","GET",undefined,200,{},"/api/customer");assert.equal(data.providers,undefined);assert.ok(data.customer);
    const account=await (await fetch(base+"/cuenta")).text();assert.doesNotMatch(account,/Continuar con Google|Continuar con Facebook|fonts\.googleapis\.com/);
    await request("device","POST",orderPayload(),401);
  });
  await check("Cerrar sesión revoca el acceso administrativo",async()=>{
    const previous=cookieJars.admin.get("azumi_admin");await request("admin","POST",{action:"logout"});cookieJars.admin.set("azumi_admin",previous);await request("admin","PATCH",{action:"catalog",revision:1,changes:{settings:initial.settings}},401);
  });
  await check("Pedidos y catálogo sobreviven al reinicio del servidor",async()=>{
    child.kill();await new Promise(resolve=>child.once('exit',resolve));child=startServer();
    let restarted=false;
    for(let i=0;i<120;i++){try{if((await fetch(base+"/api/azumi")).ok){restarted=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}
    assert.ok(restarted);const restored=await request("customer");assert.equal(restored.orders.length,2);assert.equal(restored.orders[0].id,created.id);assert.equal(restored.orders[0].status,"Entregado");assert.equal(restored.products[0].price,15);assert.equal(restored.settings.restaurantOpen,false);assert.equal((await request("customer","GET",undefined,200,{},"/api/push")).publicKey,pushPublicKey);
  });
  console.log(`\n${passed} pruebas de integración aprobadas.`);
} catch(error) { console.error(error);console.error(serverOutput);process.exitCode=1; }
finally {
  child.kill();
  await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});
  for(const name of ['azumi.sqlite','azumi.sqlite-wal','azumi.sqlite-shm']){const file=path.join(directory,name);if(existsSync(file))unlinkSync(file);}
  rmdirSync(directory);
}
