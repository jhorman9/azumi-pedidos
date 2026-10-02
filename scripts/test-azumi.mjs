import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
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
  const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p",String(port)],{cwd:process.cwd(),env:{...process.env,AZUMI_DATABASE_PATH:path.join(directory,"azumi.sqlite"),AZUMI_ADMIN_EMAIL:"admin@test.azumi",AZUMI_ADMIN_PASSWORD:"azumi-test-password-2026"},stdio:["ignore","pipe","pipe"]});
  server.stdout.on("data",data=>{serverOutput+=data;});server.stderr.on("data",data=>{serverOutput+=data;});
  return server;
}
let child=startServer();
const cookieJars={customer:new Map(),other:new Map(),admin:new Map()};
async function request(who,method="GET",payload,expected=200,extraHeaders={}) {
  const jar=cookieJars[who];
  const response=await fetch(base+"/api/azumi",{method,headers:{...payload?{"Content-Type":"application/json"}:{},Cookie:[...jar].map(([k,v])=>k+"="+v).join("; "),Origin:base,...extraHeaders},body:payload?JSON.stringify(payload):undefined});
  for(const entry of response.headers.getSetCookie()){const [cookie]=entry.split(";"), separator=cookie.indexOf("=");jar.set(cookie.slice(0,separator),cookie.slice(separator+1));}
  const data=await response.json();
  assert.equal(response.status,expected,JSON.stringify(data));
  return data;
}
let passed=0;
async function check(name,action){await action();passed++;console.log(`✓ ${name}`);}
const orderPayload=(overrides={})=>({action:"order",requestKey:randomUUID(),items:[{productId:"arroz",qty:2,variant:"Combinación",extras:[{name:"Lumpia",cost:0}],unit:0,notes:"Sin cebolla"}],fulfillment:"pickup",point:null,address:"",customer:{name:"Cliente de prueba",phone:"60000000",payment:"Efectivo",cash:50},coupon:"AZUMI10",expectedTotal:26.08,...overrides});

try {
  let ready=false;
  for(let i=0;i<120;i++) {
    if(child.exitCode!==null)throw new Error(serverOutput);
    try{if((await fetch(base+"/api/azumi")).ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.ok(ready,"Test server did not become ready: "+serverOutput);
  let initial, created, admin;
  await check("Menú e imágenes cargan desde Next.js",async()=>{
    initial=await request("customer");assert.equal(initial.products.length,7);assert.equal(initial.admin,false);assert.equal(initial.development,false);
    assert.equal((await fetch(base+"/images/products/sushi.jpg")).status,200);
    const html=await (await fetch(base)).text();assert.match(html,/Azumi/);assert.match(html,/Arroz Frito/);assert.doesNotMatch(html,/azumi\/app.js/);
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
  const original=orderPayload();
  await check("Pedido calcula variantes, extras y cupón en servidor",async()=>{
    created=(await request("customer","POST",original,201)).order;
    assert.equal(created.totals.subtotal,28.98);assert.equal(created.totals.discount,2.9);assert.equal(created.totals.total,26.08);assert.equal(created.items[0].unit,14.49);assert.equal(created.paymentStatus,"Pendiente");
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
    await request("admin","PATCH",{action:"status",id:created.id,status:"Entregado",previousStatus:"Confirmado"});
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
    const sandbox={exports:{},Intl,Date,structuredClone};vm.runInNewContext(compiled,sandbox);
    const model=sandbox.exports,current=await request("admin"),product=current.products.find(p=>p.id==="arroz");
    const item=model.createItem(product,"Combinación",["Lumpia"],2,"Sin cebolla");assert.equal(item.unit,16.5);assert.equal(item.qty,2);
    const updated=model.reconcileCart(created.items,current);assert.equal(updated[0].unit,16.5);assert.equal(updated[0].qty,2);
    const personal={...model.emptyPersonal,cart:updated,fulfillment:"pickup",coupon:"AZUMI10"};assert.equal(model.cartTotals(current,personal).total,29.7);
    const unavailable=structuredClone(current);unavailable.products.find(p=>p.id==="arroz").active=false;assert.equal(model.reconcileCart(updated,unavailable)[0].unavailable,true);
  });
  await check("Cerrar sesión revoca el acceso administrativo",async()=>{
    const previous=cookieJars.admin.get("azumi_admin");await request("admin","POST",{action:"logout"});cookieJars.admin.set("azumi_admin",previous);await request("admin","PATCH",{action:"catalog",revision:1,changes:{settings:initial.settings}},401);
  });
  await check("Pedidos y catálogo sobreviven al reinicio del servidor",async()=>{
    child.kill();await new Promise(resolve=>child.once('exit',resolve));child=startServer();
    let restarted=false;
    for(let i=0;i<120;i++){try{if((await fetch(base+"/api/azumi")).ok){restarted=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}
    assert.ok(restarted);const restored=await request("customer");assert.equal(restored.orders.length,2);assert.equal(restored.orders[0].id,created.id);assert.equal(restored.orders[0].status,"Entregado");assert.equal(restored.products[0].price,15);assert.equal(restored.settings.restaurantOpen,false);
  });
  console.log(`\n${passed} pruebas de integración aprobadas.`);
} catch(error) { console.error(error);console.error(serverOutput);process.exitCode=1; }
finally {
  child.kill();
  await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});
  for(const name of ['azumi.sqlite','azumi.sqlite-wal','azumi.sqlite-shm']){const file=path.join(directory,name);if(existsSync(file))unlinkSync(file);}
  rmdirSync(directory);
}
