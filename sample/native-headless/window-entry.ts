import {connect} from '../../src/index.js';
import {createYard} from '../src/core.js';
declare const __launch: {url:string;token:string};
declare function __window(callback:(action:string)=>void):void;
declare function __render(text:string):void;
declare function __fatal():never;
declare const __kestrelRelease: string;

void (async()=>{
 const host=await connect({url:__launch.url,token:__launch.token});
 let display=host.grant.display;
 let redraw: (()=>void)|undefined;
 if (!host.grant.headless) {
  host.on('display', message=>{display=message.display;redraw?.();});
 }
 const yard=await createYard(host);
 const guide=atob(await host.read('build/macos-arm64/guide.txt'));
 if (host.grant.headless) return;
 let status=`Release ${__kestrelRelease}. ${guide}`;
 const draw=()=>{
  const v=yard.view();
  __render(JSON.stringify({
   summary:`Day ${v.day}. ${v.weather}. ${v.crew} crew, ${v.berths} berths. Assigned to ${v.assignment}.`,
   progress:`${v.completed} of ${v.orders} orders ready. Timber ${v.timber.toFixed(1)}, hulls ${v.hulls.toFixed(1)}, rigging ${v.rigging.toFixed(1)}.`,
   status,display,
  }));
 };
 redraw=draw;
 yard.subscribe(draw);
 __window(action=>{void (async()=>{status='';if(action==='advance')yard.advance();else if(action==='save'){await yard.save('own');status='Saved to your account.';}else if(action==='close'){await yard.save('leaving');yard.close();return;}else yard.assign(action);draw();})().catch(()=>{status='The yard could not complete that action.';draw();});});
 draw();
})().catch(()=>__fatal());
