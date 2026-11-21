import torch,torch.nn as nn,numpy as np
from PIL import Image
class RB(nn.Module):
    def __init__(s,f):
        super().__init__();s.conv_block=nn.Sequential(nn.ReflectionPad2d(1),nn.Conv2d(f,f,3),nn.InstanceNorm2d(f),nn.ReLU(True),nn.ReflectionPad2d(1),nn.Conv2d(f,f,3),nn.InstanceNorm2d(f))
    def forward(s,x):return x+s.conv_block(x)
class G(nn.Module):
    def __init__(s,i=3,o=1,n=3):
        super().__init__()
        m0=[nn.ReflectionPad2d(3),nn.Conv2d(i,64,7),nn.InstanceNorm2d(64),nn.ReLU(True)]
        f=64;of=128;m1=[]
        for _ in range(2):m1+=[nn.Conv2d(f,of,3,stride=2,padding=1),nn.InstanceNorm2d(of),nn.ReLU(True)];f=of;of=f*2
        m2=[RB(f) for _ in range(n)];of=f//2;m3=[]
        for _ in range(2):m3+=[nn.ConvTranspose2d(f,of,3,stride=2,padding=1,output_padding=1),nn.InstanceNorm2d(of),nn.ReLU(True)];f=of;of=f//2
        m4=[nn.ReflectionPad2d(3),nn.Conv2d(64,o,7),nn.Sigmoid()]
        s.model0=nn.Sequential(*m0);s.model1=nn.Sequential(*m1);s.model2=nn.Sequential(*m2);s.model3=nn.Sequential(*m3);s.model4=nn.Sequential(*m4)
    def forward(s,x):return s.model4(s.model3(s.model2(s.model1(s.model0(x)))))
net=G();net.load_state_dict(torch.load('/tmp/ml/sk_model.pth',map_location='cpu'));net.eval()
def run(img):
    x=torch.from_numpy(np.array(img.convert('RGB')).astype('float32')/255).permute(2,0,1)[None]
    with torch.no_grad():y=net(x)[0,0].numpy()
    return y
if __name__=='__main__':
    import sys
    tiles=[]
    for r in ['0','2','4','5','7','8']:
        im=Image.open(f'/tmp/src{r}.png').convert('RGB');m=np.array(Image.open(f'/tmp/msk{r}.png'))>127
        a=np.array(im);a[~m]=255;y=run(Image.fromarray(a))
        print(r,y.min(),y.max(),y.mean())
        out=(255-(y*255)).clip(0,255).astype('uint8') if y.mean()<.5 else (y*255).astype('uint8')
        tiles.append(Image.fromarray(out).resize((320,320)))
    W=Image.new('L',(960,640),255)
    for i,t in enumerate(tiles):W.paste(t,((i%3)*320,(i//3)*320))
    W.save('/tmp/ld.png')
