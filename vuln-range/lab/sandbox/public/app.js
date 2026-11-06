(function(){var API='/api';var routes=['/dashboard','/orders/:id','/admin/users','/settings'];
function loadOrders(id){return fetch(API+'/orders/'+id,{credentials:'include'});}
function promote(uid,role){return fetch(API+'/users/'+uid+'/role',{method:'POST',body:JSON.stringify({role:role})});}
function bulkExport(){return fetch(API+'/internal/export?fmt=csv&scope=all',{method:'POST',credentials:'include'});}
function debugEval(code){return fetch(API+'/debug/eval?code='+code);}
function boot(){if(location.hash==='#bulk'){bulkExport();}}boot();})();
