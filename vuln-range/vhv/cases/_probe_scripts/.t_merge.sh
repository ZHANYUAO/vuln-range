#!/bin/bash
L="$1"
run() {
  local name="$1"; shift
  local code="$1"
  out=$(node -e "
const _=require('$L');
const M='vhv_'+Math.random().toString(36).slice(2,8);
let err=null;
try{ $code }catch(e){ err=e.constructor.name+': '+e.message; }
const p=({})[M]!==undefined || Object.prototype[M]!==undefined;
console.log(JSON.stringify({t:'$name',polluted:p,err:err,ver:_.VERSION}));
try{delete Object.prototype[M];}catch(e){}
" 2>&1)
  echo "$out"
}
run merge_ctor_proto "_.merge({}, JSON.parse('{\"constructor\":{\"prototype\":{\"'+M+'\":1}}}'))"
run merge_proto      "_.merge({}, JSON.parse('{\"__proto__\":{\"'+M+'\":1}}'))"
run mergeWith_ctor_proto "_.mergeWith({}, JSON.parse('{\"constructor\":{\"prototype\":{\"'+M+'\":1}}}'))"
run defaultsDeep_ctor_proto "_.defaultsDeep({}, JSON.parse('{\"constructor\":{\"prototype\":{\"'+M+'\":1}}}'))"
run defaultsDeep_proto "_.defaultsDeep({}, JSON.parse('{\"__proto__\":{\"'+M+'\":1}}'))"
run assign_ctor_proto "_.assign({}, JSON.parse('{\"constructor\":{\"prototype\":{\"'+M+'\":1}}}'))"
run assignIn_proto "_.assignIn({}, JSON.parse('{\"__proto__\":{\"'+M+'\":1}}'))"
run fromPairs_proto "_.fromPairs([['__proto__',JSON.parse('{\"'+M+'\":1}')]])"
run fromPairs_ctor "_.fromPairs([['constructor',JSON.parse('{\"prototype\":{\"'+M+'\":1}}')]])"
run zipObjectDeep_ctor "_.zipObjectDeep(['constructor.prototype.'+M],[1])"
run set_ctor "_.set({},['constructor','prototype',M],1)"
run setWith_ctor "_.setWith({},['constructor','prototype',M],1,Object)"
run update_ctor "_.update({},['constructor','prototype',M],()=>1)"
run invoke_proto_ctor "_.invoke({},['__proto__','constructor','constructor'],'return 1')"
run result_proto_ctor "_.result({},['__proto__','constructor','name'])"
run method_ctor "_.method(['constructor','prototype',M])({})"
run merge_nested_ctor "_.merge({a:{}}, JSON.parse('{\"a\":{\"constructor\":{\"prototype\":{\"'+M+'\":1}}}}'))"
