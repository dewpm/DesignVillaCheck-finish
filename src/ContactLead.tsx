import { useState } from "react";
import { api } from "./api";
export default function ContactLead() {
 const [form,setForm]=useState({name:"",email:"",phone:"",type:"USER"}),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 return <form className="portal-form" onSubmit={async e=>{e.preventDefault();setBusy(true);try{await api("/leads",form);setMessage("บันทึกข้อมูลให้ทีมงานติดต่อกลับแล้ว");}catch(e){setMessage(e instanceof Error?e.message:"ส่งไม่สำเร็จ");}finally{setBusy(false);}}}><h2>ให้ทีมงานติดต่อกลับ</h2><label>ประเภท<select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="USER">ลูกค้า / User</option><option value="MERCHANT">ผู้ประกอบการ / Merchant</option></select></label>{(["name","email","phone"] as const).map(k=><label key={k}>{({name:"ชื่อ",email:"อีเมล",phone:"เบอร์โทร"})[k]}<input required={k!=="phone"} type={k==="email"?"email":"text"} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}<button disabled={busy} className="primary-button">ส่งข้อมูลติดต่อ</button>{message&&<p role="status">{message}</p>}</form>;
}
