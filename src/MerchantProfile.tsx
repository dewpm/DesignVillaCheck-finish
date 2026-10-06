import { useEffect,useState } from "react";
import { api,currentAccount } from "./api";
import { PortalShell,type Page } from "./prototype";
type Profile={businessName:string;contactName:string;phone:string;address:string;email:string};
export default function MerchantProfile({page,go}:{page:Page;go:(page:Page)=>void}) {
 const [form,setForm]=useState<Profile>({businessName:"",contactName:"",phone:"",address:"",email:""}),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{void currentAccount().then(()=>api<Profile>("/merchant/profile")).then(setForm).catch(e=>setError(e.message));},[]);
 return <PortalShell role="Merchant" page={page} go={go}><h1>ข้อมูล Merchant</h1><form className="portal-form merchant-panel" onSubmit={async e=>{e.preventDefault();setBusy(true);try{await api("/merchant/profile",form);go("owner-add-villa");}catch(e){setError(e instanceof Error?e.message:"บันทึกไม่สำเร็จ");}finally{setBusy(false);}}}>{(["businessName","contactName","phone","address"] as const).map(k=><label key={k}>{({businessName:"ชื่อธุรกิจ",contactName:"ชื่อผู้ติดต่อ",phone:"เบอร์โทร",address:"ที่อยู่"})[k]}<input required value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}<p>อีเมลบัญชี: {form.email}</p>{error&&<p role="alert">{error}</p>}<button disabled={busy} className="primary-button">บันทึกและเพิ่ม Villa</button></form></PortalShell>;
}
