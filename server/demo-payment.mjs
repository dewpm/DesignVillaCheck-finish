import { randomUUID } from 'node:crypto'
export function demoSlip(invoice){
 const reference=`DEMO-${randomUUID()}`
 const content=`BT /F1 11 Tf 30 230 Td (VillaCheck DEMO PAYMENT - NOT A BANK RECEIPT) Tj 0 -24 Td (Invoice: ${invoice.id}) Tj 0 -24 Td (Amount THB: ${(invoice.amount/100).toFixed(2)}) Tj 0 -24 Td (Reference: ${reference}) Tj 0 -24 Td (NO REAL MONEY WAS TRANSFERRED) Tj ET`
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 650 280] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];let pdf='%PDF-1.4\n';const offsets=[]
 for(const [i,o]of objects.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${o}\nendobj\n`}
 const start=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`
 return {reference,document:{name:'demo-payment-slip.pdf',type:'application/pdf',data:'data:application/pdf;base64,'+Buffer.from(pdf).toString('base64')}}
}
export async function demoMode(db,config={}){
 const row=await db.prepare("SELECT value FROM system_settings WHERE key='demo_mode'").get()
 return row?row.value==='true':config.demoMode===true
}
