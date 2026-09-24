// Runs inside a browser. Compare adjacent lines' actual glyph ink bounds, not
// only element boxes: an element can fit the viewport while its lines collide.
export function inspectTypeInk(){
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),failures=[],measurements=[];
 for(const el of document.querySelectorAll('.measured-type')){
  const style=getComputedStyle(el),size=parseFloat(style.fontSize),lines=[];
  const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode()))for(let i=0;i<node.length;i++){
   const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);const r=range.getBoundingClientRect();
   if(!r.width||!r.height)continue;
   let line=lines.at(-1);if(!line||Math.abs(line.y-r.y)>size*.5){line={y:r.y,text:''};lines.push(line);}line.text+=node.textContent[i];
  }
  ctx.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  for(const line of lines){const m=ctx.measureText(line.text);line.ascent=m.actualBoundingBoxAscent;line.descent=m.actualBoundingBoxDescent;}
  let minGap=null;
  for(let i=1;i<lines.length;i++){
   const gap=lines[i].y-lines[i-1].y-lines[i-1].descent-lines[i].ascent;
   minGap=minGap===null?gap:Math.min(minGap,gap);
   if(gap<Math.max(2,size*.12))failures.push({text:el.textContent.slice(0,80),gap,size,lineHeight:style.lineHeight});
  }
  measurements.push({text:el.textContent.slice(0,60),lines:lines.length,minGap,size,lineHeight:style.lineHeight});
 }
 return {failures,measurements};
}
