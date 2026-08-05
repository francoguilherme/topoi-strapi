import{au as w,j as e,v as n,av as C,y as a,aw as v,b as M,a as m,ax as A,ay as D,az as L,aA as T,aB as I,x as l,aC as S,aD as W,aE as N,aF as $,aG as E,aH as H,aI as K,aJ as P,S as p,at as z}from"./strapi-BkWPDWss.js";import{W as u}from"./WidgetHelpers-JSn9iKbN.js";import{g as G,a as R}from"./users-DLc-PG84.js";const F=l(a)`
  font-size: 2.4rem;
`,V=()=>{const t=w("User",s=>s.user),i=G(t),c=R(t);return e.jsxs(n,{direction:"column",gap:3,height:"100%",justifyContent:"center",children:[e.jsx(C.Item,{delayMs:0,fallback:c}),i&&e.jsx(F,{fontWeight:"bold",textTransform:"none",textAlign:"center",children:i}),t?.email&&e.jsx(a,{variant:"omega",textColor:"neutral600",children:t?.email}),t?.roles?.length&&e.jsx(n,{marginTop:2,gap:1,wrap:"wrap",children:t?.roles?.map(s=>e.jsx(v,{children:s.name},s.id))})]})},J=l(p)`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  border: 1px solid ${({theme:t})=>t.colors.neutral200};
  border-radius: ${({theme:t})=>t.borderRadius};
  overflow: hidden;
`,O=l(p)`
  border-bottom: 1px solid ${({theme:t})=>t.colors.neutral200};
  border-right: 1px solid ${({theme:t})=>t.colors.neutral200};
  display: flex;
  flex-direction: row;
  align-items: flex-start;

  &:nth-child(2n) {
    border-right: none;
  }
  &:nth-last-child(-n + 2) {
    border-bottom: none;
  }
`,Q=({locale:t,number:i})=>new Intl.NumberFormat(t,{notation:"compact",maximumFractionDigits:1}).format(i),U=l(z)`
  text-decoration: none;
  padding: ${({theme:t})=>t.spaces[3]};
`,X=()=>{const{trackUsage:t}=M(),{formatMessage:i,locale:c}=m(),{data:s,isLoading:x}=A(),{data:d,isLoading:b}=D();if(b||x)return e.jsx(u.Loading,{});if(!d||!s)return e.jsx(u.Error,{});const h={entries:{label:{id:"widget.key-statistics.list.entries",defaultMessage:"Entries"},icon:{component:e.jsx(P,{}),background:"primary100",color:"primary600"},link:"/content-manager"},assets:{label:{id:"widget.key-statistics.list.assets",defaultMessage:"Assets"},icon:{component:e.jsx(K,{}),background:"warning100",color:"warning600"},link:"/plugins/upload"},contentTypes:{label:{id:"widget.key-statistics.list.contentTypes",defaultMessage:"Content-Types"},icon:{component:e.jsx(H,{}),background:"secondary100",color:"secondary600"},link:"/plugins/content-type-builder"},components:{label:{id:"widget.key-statistics.list.components",defaultMessage:"Components"},icon:{component:e.jsx(E,{}),background:"alternative100",color:"alternative600"},link:"/plugins/content-type-builder"},locales:{label:{id:"widget.key-statistics.list.locales",defaultMessage:"Locales"},icon:{component:e.jsx($,{}),background:"success100",color:"success600"},link:"/settings/internationalization"},admins:{label:{id:"widget.key-statistics.list.admins",defaultMessage:"Admins"},icon:{component:e.jsx(N,{}),background:"danger100",color:"danger600"},link:"/settings/users?pageSize=10&page=1&sort=firstname"},webhooks:{label:{id:"widget.key-statistics.list.webhooks",defaultMessage:"Webhooks"},icon:{component:e.jsx(W,{}),background:"alternative100",color:"alternative600"},link:"/settings/webhooks"},apiTokens:{label:{id:"widget.key-statistics.list.apiTokens",defaultMessage:"API Tokens"},icon:{component:e.jsx(S,{}),background:"neutral100",color:"neutral600"},link:"/settings/api-tokens?sort=name:ASC"}},{draft:f,published:y,modified:k}=s??{draft:0,published:0,modified:0},j=f+y+k;return e.jsx(J,{children:Object.entries(h).map(([o,r])=>{const g=d?.[o];return g!==null&&e.jsx(O,{as:U,to:r.link,"data-testid":`stat-${o}`,onClick:()=>t("didOpenKeyStatisticsWidgetLink",{itemKey:o}),children:e.jsxs(n,{alignItems:"center",gap:2,children:[e.jsx(n,{padding:2,borderRadius:1,background:r.icon.background,color:r.icon.color,children:r.icon.component}),e.jsxs(n,{direction:"column",alignItems:"flex-start",children:[e.jsx(a,{variant:"pi",fontWeight:"bold",textColor:"neutral500",children:i(r.label)}),e.jsx(a,{variant:"omega",fontWeight:"bold",textColor:"neutral800",children:Q({locale:c,number:o==="entries"?j:g})})]})]})},`key-statistics-${o}`)})})},Z=()=>{const{formatMessage:t}=m();return e.jsxs(n,{direction:"column",gap:4,height:"100%",alignItems:"center",justifyContent:"center",children:[e.jsx(L,{width:"3.2rem",height:"3.2rem"}),e.jsxs(n,{direction:"column",gap:2,children:[e.jsx(a,{variant:"beta",textAlign:"center",children:t({id:"HomePage.widget.deploy-now.title",defaultMessage:"Ready to go live ?"})}),e.jsx(a,{variant:"omega",textColor:"neutral600",textAlign:"center",children:t({id:"HomePage.widget.deploy-now.description",defaultMessage:"Deploy with Strapi Cloud"})})]}),e.jsx(T,{href:"https://cloud.strapi.io/login",isExternal:!0,size:"L",startIcon:e.jsx(I,{}),children:t({id:"HomePage.widget.deploy-now.button",defaultMessage:"Deploy Now"})})]})};export{Z as DeployNowWidget,X as KeyStatisticsWidget,V as ProfileWidget};
