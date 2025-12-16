import{a as h,cd as j,j as e,T as i,k as n,x as u,a6 as v,ce as b}from"./strapi-CeuXhhuR.js";const l=u(b)`
  width: 100%;
  background-color: ${({theme:s})=>s.colors.neutral200};
  > div {
    background-color: ${({theme:s})=>s.colors.neutral700};
  }
`,f=u(v.Item)`
  ${({theme:s})=>s.breakpoints.large} {
    grid-column: 7 / 13;
  }
`,I=()=>{const{formatMessage:s}=h(),{data:r,isLoading:g,error:m}=j(void 0,{refetchOnMountOrArgChange:!0});if(g||m||!r||!r.subscription?.cmsAiEnabled)return null;const t=r.subscription.cmsAiCreditsBase,a=r.cmsAiCreditsUsed,o=r.subscription.cmsAiCreditsMaxUsage,c=a-t,x=a/t*100,p=a/o*100,d=c>0&&o!==t;return e.jsxs(f,{col:6,s:12,direction:"column",alignItems:"start",gap:2,children:[e.jsx(i,{variant:"sigma",textColor:"neutral600",children:s({id:"Settings.application.ai-usage",defaultMessage:"AI Usage"})}),e.jsxs(n,{gap:2,direction:"column",alignItems:"flex-start",children:[!d&&e.jsxs(e.Fragment,{children:[e.jsx(n,{width:"100%",children:e.jsx(l,{value:x,size:"M"})}),e.jsx(i,{variant:"omega",children:`${a.toFixed(2)} credits used from ${t} credits available in your plan`})]}),d&&e.jsxs(e.Fragment,{children:[e.jsx(n,{width:"100%",children:e.jsx(l,{value:p,size:"M",color:"danger"})}),e.jsx(i,{variant:"omega",textColor:"danger600",children:`${c.toFixed(2)} credits used above the ${t} credits available in your plan`})]})]})]})};export{I as AIUsage};
