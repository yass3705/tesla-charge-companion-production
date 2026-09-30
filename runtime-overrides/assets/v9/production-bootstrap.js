(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){
    root.TCCV9ProductionBootstrap=api;
    if(root.TCCV9BrowserLoaders&&root.TCCV9ProductionLoaders){
      try{api.install();}catch(err){console.error('[TCC V9 production] bootstrap failed',err);}
    }
  }
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  function install(){
    if(!root)throw new Error('global runtime unavailable');
    if(root.__TCC_V9_PRODUCTION_INTEGRATION_INSTALLED__)return root.TCCV9BrowserLoaders;
    if(!root.TCCV9BrowserLoaders)throw new Error('TCCV9BrowserLoaders missing');
    if(!root.TCCV9ProductionLoaders?.install)throw new Error('TCCV9ProductionLoaders missing');
    if(!root.TCCV9Adapters?.germanyNational)throw new Error('Germany production adapter missing');
    if(!root.TCCV9Adapters?.ukOpenFeeds)throw new Error('UK production adapter missing');
    if(!root.TCCV9Adapters?.moroccoPublic)throw new Error('Morocco production adapter missing');
    if(!root.TCCV9Adapters?.switzerlandAvia)throw new Error('Switzerland AVIA production adapter missing');
    if(!root.TCCV9Adapters?.italyIonityExact)throw new Error('Italy IONITY exact production adapter missing');
    if(!root.TCCV9Adapters?.franceIonityExact)throw new Error('France IONITY exact production adapter missing');
    const loaders=root.TCCV9ProductionLoaders.install({
      baseLoaders:root.TCCV9BrowserLoaders,
      adapters:{
        germanyNational:root.TCCV9Adapters.germanyNational,
        ukOpenFeeds:root.TCCV9Adapters.ukOpenFeeds,
        moroccoPublic:root.TCCV9Adapters.moroccoPublic,
        switzerlandAvia:root.TCCV9Adapters.switzerlandAvia,
        italyIonityExact:root.TCCV9Adapters.italyIonityExact,
        franceIonityExact:root.TCCV9Adapters.franceIonityExact
      }
    });
    root.__TCC_V9_PRODUCTION_INTEGRATION_INSTALLED__=true;
    return loaders;
  }
  return{install};
});
