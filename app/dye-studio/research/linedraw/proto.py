import numpy as np,sys
from PIL import Image
from scipy import ndimage as ndi
from ld import run
def make(r,t1=.17,rad=1.3,sh=.07,smooth=1.1):
    im=Image.open(f'/tmp/crop{r}.png').convert('RGB');m=np.array(Image.open(f'/tmp/cmsk{r}.png').convert('L'))>127
    a=np.array(im);b=a.copy();b[~m]=255
    y=run(Image.fromarray(b));d=1-y
    g=np.array(im.convert('L')).astype(float);gs=ndi.gaussian_filter(g,2)
    vals=gs[m];lo,hi=np.percentile(vals,[2,99]);gn=np.clip((gs-lo)/(hi-lo)*255,0,255)
    line=d>t1
    line=ndi.gaussian_filter(line.astype(float),rad)>.22
    shadow=(gn<np.percentile(gn[m],sh*100))&m
    blk=(line|shadow)&m
    ring=m&~ndi.binary_erosion(m,iterations=3)
    blk|=ring&(gn<200)
    f=ndi.gaussian_filter(blk.astype(float),smooth)>.5
    lab,n=ndi.label(f);sz=ndi.sum(f,lab,range(1,n+1));keep=np.isin(lab,[i+1 for i,s in enumerate(sz) if s>=70])
    return keep&m
if __name__=='__main__':
    tiles=[]
    for r in ['0','2','4','5','7','8']:
        k=make(r);Image.fromarray((~k*255).astype('uint8')).save(f'/tmp/pc{r}.png');tiles.append(Image.fromarray((~k*255).astype('uint8')).resize((320,320)))
    W=Image.new('L',(960,640),255)
    for i,t in enumerate(tiles):W.paste(t,((i%3)*320,(i//3)*320))
    W.save('/tmp/proto2.png')
