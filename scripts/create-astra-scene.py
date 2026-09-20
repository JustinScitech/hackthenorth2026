"""Photo-informed Engineering 7 / E5 context. Architectural interpretation, not an as-built survey.
Coordinates are Blender Z-up; 1 model unit is approximately 4 real-world metres.
Geometry is batched by semantic part/material to keep browser draw calls low.
"""
import bpy, math, random, os
from mathutils import Vector
random.seed(7)
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(ROOT,'public','models'); SOURCE=os.path.join(ROOT,'assets','astra')
os.makedirs(OUT,exist_ok=True);os.makedirs(SOURCE,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
M={}; B={}
def material(name,c,rough=.6,metal=0,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 if emission:p.inputs['Emission Color'].default_value=(*c,1);p.inputs['Emission Strength'].default_value=emission
 M[name]=m;return name
concrete=material('Limestone concrete',(.63,.65,.63));pale=material('Silver anodized aluminum',(.77,.8,.8),.36,.45)
white=material('Porcelain frit light',(.73,.78,.80),.34,.26);frit=material('Porcelain frit mid',(.57,.64,.69),.32,.32);fritdark=material('Porcelain frit shadow',(.43,.51,.57),.30,.4)
glass=material('Blue gray architectural glass',(.12,.25,.3),.19,.65);glint=material('Sky reflection',(.32,.48,.52),.18,.55)
dark=material('Graphite metal',(.10,.13,.15),.42,.4);roof=material('Roof membrane',(.25,.29,.29),.9)
wood=material('Warm oak',(.51,.34,.19),.72);red=material('Atrium red stairs',(.68,.028,.055),.43,.12)
yellow=material('Atrium citron panels',(.63,.72,.12));orange=material('Atrium orange panels',(.87,.21,.065))
floor=material('Polished terrazzo',(.68,.68,.63),.4);screen=material('Lab displays',(.06,.16,.19),.28,.15,.15)
warm=material('Interior warm light',(.87,.68,.39),.5,0,.35);road=material('Asphalt',(.105,.12,.13),.98)
grass=material('Low planting groundcover',(.10,.17,.07));bark=material('Tree bark',(.19,.14,.095),.96)
foliage=[material('Leaf shade '+str(i),c,.93) for i,c in enumerate([(.075,.15,.045),(.12,.21,.065),(.18,.27,.095),(.25,.32,.13)])]
pavers=[material('Limestone paving '+str(i),c,.88) for i,c in enumerate([(.64,.64,.61),(.66,.66,.63),(.65,.65,.62)])]
soil=material('Mulched soil',(.12,.105,.078),1)
annex=material('Charcoal facade panels',(.115,.12,.13),.72,.18)
canopyglass=material('Cycle shelter glass',(.46,.58,.57),.22,.25)
M[canopyglass].diffuse_color=(.46,.58,.57,.3)
M[canopyglass].node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.3
blue=material('Bicycle enamel',(.035,.24,.48),.37,.22);rubber=material('Rubber',(.025,.032,.032));aggregate=material('Asphalt aggregate',(.28,.29,.28))
def mesh(part,mat,verts,faces):
 key=(part,mat);v,f=B.setdefault(key,([],[]));n=len(v);v.extend(verts);f.extend([tuple(n+i for i in face) for face in faces])
def box(part,loc,size,mat):
 x,y,z=loc;a,b,c=[v/2 for v in size]
 mesh(part,mat,[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),(x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)],[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)])
def beam(part,a,b,width,depth,mat):
 a=Vector(a);b=Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,0,1)))
 if u.length<.01:u=axis.cross(Vector((0,1,0)))
 u.normalize();v=axis.cross(u).normalized();verts=[tuple(p+u*i*width/2+v*j*depth/2) for p in [a,b] for i,j in [(-1,-1),(1,-1),(1,1),(-1,1)]]
 mesh(part,mat,verts,[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)])
def cylinder(part,loc,r,h,mat,n=12):
 x,y,z=loc;verts=[(x+math.cos(i*math.tau/n)*r,y+math.sin(i*math.tau/n)*r,z+zz*h/2) for zz in [-1,1] for i in range(n)]
 faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)];mesh(part,mat,verts,faces)
def label(part,body,loc,size,mat,rotation=(math.pi/2,0,0)):
 bpy.ops.object.text_add(location=loc,rotation=rotation);o=bpy.context.object;o.data.body=body;o.data.size=size;o.data.align_x='CENTER';o.data.extrude=.001;o.data.materials.append(M[mat]);bpy.ops.object.convert(target='MESH');o.name=part+'__'+body
# Small reusable geometry helpers keep the campus detail in material batches.
def tube(part,points,r,mat,sides=6,radii=None):
 points=[Vector(p) for p in points];verts=[]
 for i,p in enumerate(points):
  tangent=(points[min(len(points)-1,i+1)]-points[max(0,i-1)]).normalized()
  ref=Vector((0,0,1)) if abs(tangent.z)<.95 else Vector((0,1,0))
  u=tangent.cross(ref).normalized();v=tangent.cross(u).normalized();radius=radii[i] if radii else r
  for j in range(sides):verts.append(tuple(p+radius*(u*math.cos(j*math.tau/sides)+v*math.sin(j*math.tau/sides))))
 faces=[]
 for i in range(len(points)-1):
  for j in range(sides):faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
 mesh(part,mat,verts,faces)
def rounded_rect(x,y,w,d,r,steps=6):
 points=[]
 for cx,cy,start in [(x+w/2-r,y+d/2-r,0),(x-w/2+r,y+d/2-r,90),(x-w/2+r,y-d/2+r,180),(x+w/2-r,y-d/2+r,270)]:
  for i in range(steps+1):
   a=math.radians(start+i*90/steps);points.append((cx+math.cos(a)*r,cy+math.sin(a)*r))
 return points

def slab(part,outline,bottom,top,mat):
 n=len(outline);verts=[(x,y,z) for z in [bottom,top] for x,y in outline]
 faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 mesh(part,mat,verts,faces)
def paved_area(x0,x1,y0,y1,tile=.6):
 box('site',((x0+x1)/2,(y0+y1)/2,.17),(x1-x0,y1-y0,.12),concrete)
 nx=math.ceil((x1-x0)/tile);ny=math.ceil((y1-y0)/tile);w=(x1-x0)/nx;d=(y1-y0)/ny
 for i in range(nx):
  for j in range(ny):
   x=x0+i*w;y=y0+j*d
   mesh('site',pavers[(i*13+j*7)%3],[(x+.007,y+.007,.236),(x+w-.007,y+.007,.236),(x+w-.007,y+d-.007,.236),(x+.007,y+d-.007,.236)],[(0,1,2,3)])
# Street-facing composition from the supplied courtyard photograph.
# One continuous asphalt forecourt feeds a clear road beneath the pedestrian bridge.
# No rail infrastructure belongs in this view.
box('site',(1.9,.5,-.45),(26.8,19,.75),dark)
box('site',(1.9,.5,-.025),(26.76,18.96,.12),concrete)
box('road',(1.9,.5,.065),(26.5,18.7,.11),road)
# Road corridor x=-10.35..-6.35 remains unobstructed through the bridge crossing.
paved_area(-11.30,-10.42,-8.5,9.5,.9)
paved_area(-6.28,-5.82,-2.75,7.6,.9)
paved_area(-5.82,5.93,-3.42,-2.59,.9)
paved_area(5.93,12.03,-3.37,8.13,1.05)
paved_area(-5.8,5.8,7.55,8.25,.9)
# A single low concrete plaza edge follows the canopy, leaving asphalt beyond it.
slab('site',rounded_rect(8.98,2.39,6.38,11.85,.24),.10,.213,concrete)
for x in [-10.39,-6.31]:box('site',(x,3.18,.18),(.11,12.70,.16),concrete)
# Front curb runs along the building sidewalk, then turns along the cycle pavilion.
box('site',(.0,-3.48,.18),(11.64,.11,.16),concrete)
# The foreground planted corner is outside the pedestrian plaza, as in the photo.
slab('site',rounded_rect(14.43,-4.6,1.48,4.15,.56),.11,.225,concrete)
slab('site',rounded_rect(14.43,-4.6,1.26,3.93,.48),.20,.239,soil)
slab('site',rounded_rect(14.43,-4.6,1.12,3.78,.43),.23,.245,grass)
# Fine asphalt texture and modest repair seams; this court has no lane striping.
for i in range(2300):
 x=random.uniform(-11.3,15.1);y=random.uniform(-8.8,9.7)
 if not (y<-3.6 or x>12.3 or -10.3<x<-6.4):continue
 r=random.uniform(.003,.010)
 mesh('road',aggregate,[(x-r,y,.122),(x+r,y+.002,.122),(x,y+r,.122)],[(0,1,2)])
for points in [[(-9,-6,.124),(-8.8,-4.8,.124),(-8.93,-3.5,.124),(-8.8,-2.4,.124)],[(2.3,-7.8,.124),(2.5,-6.6,.124),(2.2,-5.5,.124),(2.35,-4.1,.124)]]:tube('road',points,.005,dark,4)
# Small planting pockets stay behind the curb and outside the vehicle route.
for x,w in [(-1.5,2.0),(3.4,1.8)]:
 slab('site',rounded_rect(x,-3.14,w,.31,.10),.225,.26,concrete)
 slab('site',rounded_rect(x,-3.14,w-.08,.23,.08),.25,.269,soil)
# Main E7 seven-level bar; a real void remains between E7 and E5.
base=.32;step=1.04;top=7.68
for level in range(7):
 z=base+level*step;part='interior' if level==0 else 'upper'
 box(part,(0,-.4,z),(11.6,4.4,.14),floor)
 # Offices and teaching rooms: simple interpreted layouts, not surveyed rooms.
 for x in [-4.5,-2.4,-.3,1.8,4.1]:
  if level>0:box(part,(x,.6,z+.51),(.045,2.25,.9),concrete)
  for yy in [-1.55,.6]:
   box(part,(x,yy,z+.42),(1.25,.56,.055),wood)
   for dx in [-.48,.48]:box(part,(x+dx,yy,z+.24),(.035,.45,.38),dark)
   box(part,(x,yy+.16,z+.60),(.32,.045,.25),screen)
   box(part,(x,yy-.5,z+.24),(.28,.27,.06),dark)
   box(part,(x,yy-.64,z+.41),(.28,.045,.27),dark)
 for y in [-1.9,1.15]:
  box(part,(0,y,z+.94),(10.9,.035,.018),warm)
# Reinforced columns, beams and atrium gallery edge.
for x in [-5.4,-3.6,-1.8,0,1.8,3.6,5.4]:
 for y in [-2.15,1.35]:box('frame',(x,y,3.97),(.16,.16,7.28),concrete)
 for level in range(1,8):box('frame',(x,-.4,base+level*step-.09),(.13,4.25,.19),concrete)
for level in range(1,8):
 box('frame',(0,1.45,base+level*step-.1),(11.4,.18,.20),concrete)
# Ground-floor lobby glazing, vestibules and canopy.
for x in [i*.58-5.51 for i in range(20)]:
 box('shell',(x,-2.625,.83),(.555,.025,.95),glass if int((x+6)*10)%3 else glint)
 box('shell',(x+.285,-2.65,.85),(.026,.06,1.03),pale)
for x in [-3.4,0,4.35]:
 box('shell',(x,-2.75,.84),(1.12,.035,.94),glass)
 box('shell',(x,-2.80,.84),(.035,.035,.94),pale)
 for dx in [-.09,.09]:box('shell',(x+dx,-2.84,.82),(.018,.045,.20),pale)
box('shell',(0,-2.69,1.45),(11.72,.14,.055),pale)
box('shell',(-.05,-2.93,1.38),(1.7,.62,.06),dark)
label('shell','WATERLOO  ENGINEERING',(0,-2.785,1.25),.125,pale)
# Recessed entrance hardware, lower transoms, and narrow glazing sills.
for x in [-3.4,0,4.35]:
 box('shell',(x,-2.815,.51),(1.13,.024,.04),pale)
 box('shell',(x,-2.812,1.11),(1.13,.024,.025),pale)
for x in [i*.58-5.51 for i in range(20)]:box('shell',(x,-2.659,.39),(.56,.035,.045),dark)
# E7's triangular motif is a flat printed/fritted glass pattern, not a folded metal wall.
def frit_panel(part,corners):
 a,b,c,d=[Vector(v) for v in corners];m=(a+b+c+d)*.25
 for pts,mat in [([a,b,m],fritdark),([b,c,m],frit),([c,d,m],white),([d,a,m],pale)]:mesh(part,mat,[tuple(v) for v in pts],[(0,1,2)])
cols=24;rows=12;w=11.6/cols;h=(top-1.46)/rows
for col in range(cols):
 x=-5.8+col*w
 for row in range(rows):
  z=1.46+row*h
  # Tall glazed slot, the offset two-level window and three horizontal office windows.
  clear=(2.40<x<3.39) or (-2.42<x<-1.92 and 5.1<z<6.7) or (3.8<x<5.4 and row in [2,3,5,6,8,9])
  if clear:box('shell',(x+w/2,-2.622,z+h/2),(w-.012,.025,h-.012),glass if row%2 else glint)
  else:frit_panel('shell',[(x,-2.645,z),(x+w,-2.645,z),(x+w,-2.645,z+h),(x,-2.645,z+h)])
for x in [i*w-5.8 for i in range(cols+1)]:box('shell',(x,-2.665,4.58),(.018,.025,6.25),pale)
for row in range(rows+1):box('shell',(0,-2.67,1.46+row*h),(11.63,.027,.016),pale)
# Pattern wraps both ends, with atrium-facing windows at the back of E7.
for side in [-1,1]:
 x=side*5.82
 for j in range(9):
  y=-2.6+j*4.4/9
  for row in range(rows):
   z=1.46+row*h
   frit_panel('shell',[(x,y,z),(x,y+4.4/9,z),(x,y+4.4/9,z+h),(x,y,z+h)])
 for yy in [-2.6+i*.55 for i in range(9)]:box('shell',(x+side*.012,yy,4.57),(.02,.02,6.25),pale)
 for row in range(rows+1):box('shell',(x, -.4,1.46+row*h),(.03,4.42,.017),pale)
 for y in [-2.3,-1.7,-1.1,-.5,.1,.7,1.3]:box('shell',(x,y,.87),(.025,.56,1.0),glass)
for level in range(7):
 z=base+level*step
 for x in [-5,-3,-1,1,3,5]:
  box('atriumwall',(x,1.82,z+.52),(1.86,.035,.81),glass)
  box('atriumwall',(x+.96,1.80,z+.52),(.05,.07,.93),pale)
# Main roof parapets, penthouse, rooftop services.
box('roof',(0,-.4,7.73),(11.7,4.5,.14),roof)
for y in [-2.67,1.87]:box('roof',(0,y,7.89),(11.78,.09,.29),pale)
for x in [-5.88,5.88]:box('roof',(x,-.4,7.89),(.09,4.6,.29),pale)
box('roof',(-.8,-.05,8.09),(8.4,2.48,.69),dark)
for x in [i*.45-4.8 for i in range(19)]:box('roof',(x,-1.306,8.1),(.018,.025,.64),pale)
for x in [-3,-.7,1.6]:
 box('roof',(x,.1,8.57),(1.25,.95,.24),pale)
 for dx in [-.3,.3]:cylinder('roof',(x+dx,.1,8.72),.23,.05,dark,16)
for x in [-4.8,3.3,4.5]:cylinder('roof',(x,-.3,8.27),.065,.55,pale)
# E5 is context: a lower companion bar, not a second copy of E7.
box('context',(0,5.85,3.22),(11.6,3.3,5.94),dark)
box('context',(0,5.85,6.28),(11.75,3.45,.18),roof)
for side in [-1,1]:
 for j in range(7):
  y=4.22+j*.47
  for row in range(10):
   z=1.0+row*.52
   frit_panel('context',[(side*5.825,y,z),(side*5.825,y+.465,z),(side*5.825,y+.465,z+.515),(side*5.825,y,z+.515)])
for level in range(6):
 z=.35+level*.98
 for x in [i*.7-5.25 for i in range(16)]:
  box('context',(x,7.515,z+.45),(.65,.025,.81),glass if level%2 else glint)
  box('context',(x,4.18,z+.48),(.66,.025,.78),glass)
 box('context',(0,4.14,z+.92),(11.65,.07,.10),pale)
 # Bright study pods visible from the atrium.
 for i,x in enumerate([-4.5,-2.5,2.5,4.5]):
  box('atrium',(x,4.08,z+.45),(1.1,.055,.70),[yellow,orange,dark,yellow][(i+level)%4])
# Seven-storey atrium: open volume, balconies, bridges and its red feature stair.
box('interior',(0,3,.28),(11.6,2.4,.13),floor)
for level in range(1,7):
 z=base+level*step
 for y in [1.96,4.04]:
  box('atrium',(0,y,z),(11.58,.39,.10),concrete)
  box('atrium',(0,y,z+.4),(11.6,.024,.032),pale)
  for x in [i*.7-5.6 for i in range(17)]:box('atrium',(x,y,z+.2),(.02,.025,.4),pale)
 for x in [-4.6,4.6]:
  box('atrium',(x,3,z),(1.02,2.35,.12),concrete)
  for xx in [x-.49,x+.49]:
   box('atrium',(xx,3,z+.39),(.026,2.32,.028),pale)
   for yy in [2,2.5,3,3.5,4]:box('atrium',(xx,yy,z+.20),(.02,.025,.38),pale)
 # Stairs alternate direction; solid red stringers and landings are faithful to the section.
 x0=-1.3 if level%2 else 1.3;x1=-x0;z0=base+(level-1)*step;z1=z
 for n in range(16):
  t=(n+.5)/16;x=x0+(x1-x0)*t;zz=z0+(z1-z0)*(n+1)/16
  box('atrium',(x,3.34,zz),(.18,.68,.055),floor)
 for yy in [2.98,3.70]:beam('atrium',(x0,yy,z0+.19),(x1,yy,z1+.19),.055,.40,red)
 box('atrium',(x1,3.35,z1),(1,.8,.12),red)
 box('atrium',(x1,3.74,z1+.2),(1,.045,.4),red)
# Glazed atrium ends, mullions, doors. They can peel away independently.
for x in [-5.86,5.86]:
 for j in range(5):
  y=1.83+j*.47
  box('atriumshell',(x,y+.22,4.03),(.025,.44,7.4),glint)
  box('atriumshell',(x,y,4.03),(.06,.026,7.5),pale)
 for level in range(8):box('atriumshell',(x,3,base+level*step),(.065,2.43,.035),pale)
 box('atriumshell',(x,3,.82),(.05,1.0,1.0),glass)
# Distinctive sawtooth roof with tall clerestory lights, spanning the atrium.
for i in range(10):
 x=-5.85+i*1.17
 mesh('atriumroof',pale,[(x,1.78,7.74),(x+1.03,1.78,8.21),(x+1.03,4.23,8.21),(x,4.23,7.74)],[(0,1,2,3)])
 box('atriumroof',(x+1.055,3,7.99),(.035,2.46,.46),glint)
 for yy in [1.79,3,4.22]:beam('atriumroof',(x,yy,7.73),(x+1.07,yy,8.24),.045,.065,pale)
# Atrium furniture, donor wall, ground-floor Ideas Clinic / robotics interpretation.
box('interior',(-5.67,3,1.05),(.07,2,.75),dark)
for x in [-3.2,2.9]:
 for y in [2.35,3.7]:
  box('interior',(x,y,.61),(1.1,.35,.12),wood)
  for dx in [-.42,.42]:box('interior',(x+dx,y,.44),(.055,.27,.27),dark)
for x in [-4.25,-2.4,2.4,4.25]:
 box('interior',(x,-.75,.67),(1.15,.7,.07),pale)
 for dx in [-.48,.48]:box('interior',(x+dx,-.75,.46),(.055,.6,.42),dark)
 cylinder('interior',(x,-.75,.82),.14,.18,orange)
 beam('interior',(x,-.75,.87),(x+.27,-.75,1.20),.09,.10,orange)
 beam('interior',(x+.27,-.75,1.20),(x+.48,-.75,1.02),.075,.085,orange)
 box('interior',(x+.52,-.75,1.0),(.13,.11,.11),dark)
# Enclosed pedestrian bridge with a curved elbow, small-segment glazing and concrete piers.
path=[(-11.3,-2.95),(-9.8,-2.95),(-8.3,-2.95),(-6.8,-2.95),(-5.3,-2.95),(-4.5,-2.91),(-3.95,-2.77),(-3.65,-2.60)]
edges=[]
for i,p in enumerate(path):
 prev=Vector(path[max(0,i-1)]);nxt=Vector(path[min(len(path)-1,i+1)]);d=(nxt-prev).normalized();n=Vector((-d.y,d.x))
 edges.append((Vector(p)-n*.47,Vector(p)+n*.47))
for i in range(len(path)-1):
 for z,thick,mat in [(2.24,.17,concrete),(3.38,.12,pale)]:
  a,b=edges[i];c,d=edges[i+1]
  verts=[(v.x,v.y,zz) for zz in [z-thick/2,z+thick/2] for v in [a,c,d,b]]
  mesh('bridge',mat,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
 for side in [0,1]:
  a=edges[i][side];b=edges[i+1][side];count=max(1,round((b-a).length/.3))
  for j in range(count):
   p=a+(b-a)*j/count;q=a+(b-a)*(j+1)/count
   beam('bridge',(p.x,p.y,2.8),(q.x,q.y,2.8),.021,1.03,glass if (i+j)%4 else glint)
   beam('bridge',(p.x,p.y,2.24),(p.x,p.y,3.39),.025,.032,pale)
# Piers sit on the sidewalks, leaving the road clear beneath the span.
for x in [-10.73,-6.12]:cylinder('bridge',(x,-2.95,1.18),.13,2.15,concrete,18)
# The dark volume is an attached building wing, not a detached shed.
# Its west edge overlaps the E5 wall at x=5.825 and shares its ground slab.
# The photo's forecourt has no overhead link crossing above the patio.
box('annex',(7.51,5.425,1.26),(3.58,4.35,2.03),annex)
box('annex',(7.51,5.425,2.31),(3.64,4.41,.075),dark)
for x in [5.73+i*.445 for i in range(9)]:box('annex',(x,3.244,1.29),(.012,.012,1.93),dark)
for y in [3.25+i*.54 for i in range(9)]:box('annex',(9.306,y,1.29),(.012,.014,1.94),dark)
for z in [.28,.83,1.38,1.93,2.27]:
 box('annex',(7.51,3.242,z),(3.58,.016,.012),dark);box('annex',(9.306,5.425,z),(.016,4.35,.012),dark)
box('annex',(7.03,3.229,.84),(.67,.028,1.10),dark)
box('annex',(8.38,3.225,.89),(.64,.025,1.07),dark)
for z in [.46,.53,.60,.67,.74,.81,.88,.95,1.02,1.09,1.16,1.23]:box('annex',(8.38,3.209,z),(.58,.021,.020),pale)
# Long, shallow canopy runs along the front of the attached wing.
# Back roof edge meets x=9.30; the front row of columns faces the asphalt court.
for x in [9.29,11.61]:
 for y in [-.9,.48,1.86,3.24,4.62,6.0,7.38]:
  # The annex wall supports the back edge where canopy and wing meet.
  if x<10 and y>3.25:continue
  box('site',(x,y,.31),(.21,.21,.17),concrete)
  box('site',(x,y,.96),(.078,.078,1.30),dark)
 box('site',(x,3.24,1.62),(.075,8.64,.08),dark)
for y in [-1.10,-.15,.80,1.75,2.70,3.65,4.60,5.55,6.50,7.52]:
 box('site',(10.45,y,1.65),(2.53,.043,.05),pale)
for i in range(10):
 y=-.63+i*.835
 box('canopyglass',(10.45,y,1.69),(2.45,.79,.016),canopyglass)
for y in [-.91,7.38]:box('site',(10.45,y,1.59),(2.17,.02,.014),warm)
# Cycle racks align with the canopy length; the open forecourt remains clear.
for x in [9.72,11.0]:
 for j in range(13):
  y=-.63+j*.61
  pts=[(x,y-.17,.24),(x,y-.17,.52)]+[(x,y+math.cos(math.pi-i*math.pi/8)*.17,.52+math.sin(math.pi-i*math.pi/8)*.17) for i in range(9)]+[(x,y+.17,.24)]
  tube('site',pts,.012,pale,6)
def bicycle(x,y,angle,paint):
 def point(a,b,z):return (x+a*math.cos(angle)-b*math.sin(angle),y+a*math.sin(angle)+b*math.cos(angle),z)
 for a in [-.25,.25]:
  pts=[point(a+math.cos(i*math.tau/20)*.145,0,.40+math.sin(i*math.tau/20)*.145) for i in range(21)]
  tube('site',pts,.012,rubber,5)
  for i in range(6):
   theta=i*math.tau/6;tube('site',[point(a,0,.40),point(a+math.cos(theta)*.14,0,.40+math.sin(theta)*.14)],.0028,pale,3)
 for a,b in [((-.25,0,.40),(-.10,0,.65)),((-.10,0,.65),(.14,0,.65)),((.14,0,.65),(.25,0,.40)),((-.25,0,.40),(0,0,.42)),((0,0,.42),(-.10,0,.65)),((0,0,.42),(.14,0,.65))]:tube('site',[point(*a),point(*b)],.012,paint,5)
 tube('site',[point(-.1,0,.65),point(-.11,0,.72)],.011,dark,5)
 tube('site',[point(.14,0,.65),point(.12,0,.76),point(.12,.09,.76)],.012,pale,5)
 tube('site',[point(-.19,0,.73),point(-.04,0,.73)],.026,dark,5)
for j in range(16):
 bicycle(9.73 if j<8 else 11.02,-.52+(j%8)*1.03,math.pi/2+random.uniform(-.12,.12),[dark,blue,red,pale][j%4])
# Reference-like sign on the front column and simple concrete seating at the wing.
box('site',(11.66,-.91,.76),(.04,.29,.26),pale)
label('site','CYCLE',(11.683,-.91,.80),.048,dark,rotation=(math.pi/2,0,math.pi/2))
for y in [.35,1.9]:
 box('site',(6.45,y,.39),(.40,.94,.30),concrete)
for x,y in [(6.4,-2.85),(7.15,-2.85),(7.9,-2.85)]:cylinder('site',(x,y,.45),.022,.42,pale,8)
# Organic street trees: tapered branch structure and scattered leaf surfaces.
def leaf_surface(center,size,mat):
 c=Vector(center);normal=Vector((random.uniform(-.8,.8),random.uniform(-.8,.8),random.uniform(.25,1))).normalized()
 u=normal.cross(Vector((0,0,1))).normalized();v=normal.cross(u).normalized();a=random.random()*math.tau;u,v=u*math.cos(a)+v*math.sin(a),-u*math.sin(a)+v*math.cos(a)
 verts=[tuple(c-u*size),tuple(c+v*size*.46),tuple(c+u*size),tuple(c-v*size*.46)]
 mesh('foliage',mat,verts,[(0,1,2,3)])
def tree(x,y,s=1):
 cylinder('site',(x,y,.245),.37*s,.018,soil,18)
 tube('landscape',[(x,y,.24),(x+.025*s,y-.014*s,.92*s),(x-.018*s,y+.027*s,1.62*s),(x+.08*s,y,2.1*s)],.04,bark,7,[.05*s,.038*s,.021*s,.008*s])
 centers=[]
 for j in range(9):
  angle=j*2.39996+random.uniform(-.2,.2);z=(.86+j*.115)*s;radius=(.68-j*.034)*s
  start=(x,y,z);mid=(x+math.cos(angle)*radius*.6,y+math.sin(angle)*radius*.6,z+.27*s);end=(x+math.cos(angle)*radius,y+math.sin(angle)*radius,z+.62*s)
  tube('landscape',[start,mid,end],.02,bark,5,[.025*s,.014*s,.003*s])
  centers.append(end)
  for sign in [-1,1]:
   a=angle+sign*.62;tip=(end[0]+math.cos(a)*.20*s,end[1]+math.sin(a)*.20*s,end[2]+.12*s)
   tube('landscape',[mid,tip],.007,bark,4,[.011*s,.002*s]);centers.append(tip)
 centers.extend([(x,y,2.14*s),(x+.12*s,y-.09*s,2.30*s)])
 for c in centers:
  for k in range(24):
   a=random.random()*math.tau;r=random.random()**.5*.27*s
   pt=(c[0]+math.cos(a)*r,c[1]+math.sin(a)*r,c[2]+random.uniform(-.18,.22)*s)
   leaf_surface(pt,random.uniform(.052,.082)*s,foliage[random.choices(range(4),[3,5,4,1])[0]])
for x,y,s in [(-10.86,.8,.90),(-10.86,4.7,1.0),(-10.86,8.1,.92),(12.63,8.85,.85),(-3.7,8.7,.96),(.2,8.7,1.03),(4.1,8.7,.96),(-1.5,-3.14,.52),(3.4,-3.14,.56)]:tree(x,y,s)
# Fine low planting and ornamental grass break up large slabs of flat green.
for x,y,w,d in [(-1.5,-3.14,1.86,.19),(3.4,-3.14,1.67,.19),(14.43,-4.6,1.04,3.58)]:
 for j in range(int(w*d*80)):
  xx=x+random.uniform(-w/2,w/2);yy=y+random.uniform(-d/2,d/2)
  leaf_surface((xx,yy,random.uniform(.29,.41)),random.uniform(.033,.060),foliage[j%3])
 for j in range(int(w*d*5)):
  xx=x+random.uniform(-w/2,w/2);yy=y+random.uniform(-d/2,d/2)
  for k in range(5):
   a=random.random()*math.tau;h=random.uniform(.10,.25)
   mesh('foliage',foliage[2],[(xx-.012,yy,.27),(xx+.012,yy,.27),(xx+math.cos(a)*h*.4,yy+math.sin(a)*h*.4,.27+h)],[(0,1,2)])
for x,y in [(-10.72,-6.5),(12.20,8.1)]:
 cylinder('site',(x,y,1.37),.022,2.5,dark);box('site',(x,y,2.61),(.28,.20,.04),warm)
# Grated storm drains and covers are flush with the plaza and roadway.
for x,y,z in [(6.7,-1.7,.25),(12.27,.2,.13),(12.27,5.8,.13)]:
 box('site',(x,y,z),(.28,.42,.012),dark)
 for j in range(7):box('site',(x,y-.18+j*.06,z+.009),(.25,.018,.012),pale)
for x,y in [(13.4,4.4),(-8.6,-5.2)]:
 cylinder('site',(x,y,.136),.16,.012,dark,20)
 for dy in [-.08,0,.08]:box('site',(x,y+dy,.144),(.22,.012,.006),pale)
cylinder('site',(6.7,-2.6,.40),.065,.43,red);cylinder('site',(6.7,-2.6,.64),.10,.06,red)
beam('site',(6.55,-2.6,.48),(6.85,-2.6,.48),.07,.09,red)
label('site','ENGINEERING 7  /  UNIVERSITY OF WATERLOO',(1.9,-9.013,-.49),.24,pale)
label('interior','ENGINEERING IDEAS CLINIC',(0,-1.9,.43),.14,dark,rotation=(0,0,0))
# Emit one mesh per semantic group/material, then compress the geometry for local delivery.
for (part,name),(verts,faces) in B.items():
 data=bpy.data.meshes.new(part+'__'+name);data.from_pydata(verts,[],faces);data.materials.append(M[name]);data.update();o=bpy.data.objects.new(part+'__'+name,data);bpy.context.collection.objects.link(o)
 if part == 'landscape':
  for poly in data.polygons:poly.use_smooth=True
# Text objects share the same semantic batches too.
by_key={}
for o in list(bpy.context.scene.objects):
 if o.type=='MESH':by_key.setdefault((o.name.split('__')[0],o.data.materials[0].name),[]).append(o)
for (part,name),objects in by_key.items():
 if len(objects)>1:
  bpy.ops.object.select_all(action='DESELECT')
  for o in objects:o.select_set(True)
  bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();bpy.context.object.name=part+'__'+name
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'engineering-7.glb'),export_format='GLB',export_yup=True,export_cameras=False,export_lights=False,export_extras=False,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=16,export_draco_normal_quantization=10)
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.32,.38,.43,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
for name,loc,energy,size,color in [('Key',(-10,-12,20),2700,12,(1,.94,.84)),('Fill',(12,-2,14),1900,10,(.82,.91,1)),('Rim',(-5,12,14),2300,10,(.88,.94,1))]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=energy;o.data.shape='DISK';o.data.size=size;o.data.color=color;o.rotation_euler=(Vector((0,0,3))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(25,-32,23));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,2.2))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=31;scene.camera=camera
scene.render.resolution_x=1600;scene.render.resolution_y=1200;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=os.path.join(OUT,'engineering-7-poster.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE,'engineering-7.blend'));bpy.ops.render.render(write_still=True)
print('ASTRA_E7_MODEL_COMPLETE')
