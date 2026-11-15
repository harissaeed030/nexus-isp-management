const clean=value=>String(value??"").replace(/[^\x20-\x7E]/g,"?").replace(/[\\()]/g,char=>"\\"+char).replace(/[\r\n]/g," ").slice(0,150);

export function createPdf(lines) {
  let y=760;
  const commands=[];
  for(const item of lines){
    const size=Math.max(8,Math.min(24,Number(item.size)||11));
    const x=Number.isFinite(item.x)?item.x:50;
    commands.push("BT /F1 "+size+" Tf "+x+" "+y+" Td ("+clean(item.text)+") Tj ET");
    y-=Number.isFinite(item.gap)?item.gap:22;
    if(y<45)break;
  }
  const stream=commands.join("\n");
  const objects=[
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length "+Buffer.byteLength(stream,"ascii")+" >>\nstream\n"+stream+"\nendstream"
  ];
  let output="%PDF-1.4\n";
  const offsets=[0];
  for(let i=0;i<objects.length;i++){
    offsets.push(Buffer.byteLength(output,"ascii"));
    output+=(i+1)+" 0 obj\n"+objects[i]+"\nendobj\n";
  }
  const xref=Buffer.byteLength(output,"ascii");
  output+="xref\n0 "+(objects.length+1)+"\n0000000000 65535 f \n";
  for(const offset of offsets.slice(1))output+=String(offset).padStart(10,"0")+" 00000 n \n";
  output+="trailer\n<< /Size "+(objects.length+1)+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n";
  return Buffer.from(output,"ascii");
}

export function formatPkr(value) {
  return new Intl.NumberFormat("en-PK",{maximumFractionDigits:0}).format(Number(value)||0);
}
