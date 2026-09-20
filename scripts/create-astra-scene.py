"""Photo-informed Engineering 7 / E5 context. Architectural interpretation, not an as-built survey.
Coordinates are Blender Z-up; 1 model unit is approximately 4 real-world metres.
Geometry is batched by semantic part/material to keep browser draw calls low.
"""
import bpy, math, random, os, hashlib, json
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
white=material('Porcelain frit light',(.78,.80,.79),.44,.18);frit=material('Porcelain frit mid',(.53,.61,.64),.35,.25);fritdark=material('Porcelain frit shadow',(.34,.43,.47),.32,.32)
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
annex=material('Charcoal facade panels',(.19,.19,.18),.74,.13)
mirror=material('Polished mirrored sign backing',(.32,.39,.41),.045,1.0)
signface=material('Raised satin steel sign letters',(.44,.46,.47),.27,.86)
wingglass=material('Full height courtyard glazing',(.13,.25,.27),.15,.72)
soffit=material('Stair luminous soffit',(.91,.86,.71),.5,0,.5)
railglass=material('Atrium balustrade glass',(.30,.47,.48),.2,.25)
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
def label(part,body,loc,size,mat,rotation=(math.pi/2,0,0),depth=.001,width=None,bold=False):
 bpy.ops.object.text_add(location=loc,rotation=rotation);o=bpy.context.object;o.data.body=body;o.data.size=size;o.data.align_x='CENTER';o.data.resolution_u=3;o.data.extrude=depth
 if bold:
  fontpath='C:/Windows/Fonts/arialbd.ttf'
  if os.path.isfile(fontpath):o.data.font=bpy.data.fonts.get('Arial Bold') or bpy.data.fonts.load(fontpath)
  o.data.bevel_depth=.002;o.data.bevel_resolution=1
 o.data.materials.append(M[mat]);bpy.context.view_layer.update()
 if width:
  local_width=max(v[0] for v in o.bound_box)-min(v[0] for v in o.bound_box)
  if local_width:o.scale.x=width/local_width
 bpy.ops.object.convert(target='MESH');o.name=part+'__'+body
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
box('site',(1.9,2.6,-.45),(26.8,23.2,.75),dark)
box('site',(1.9,2.6,-.025),(26.76,23.16,.12),concrete)
box('road',(1.9,2.6,.065),(26.5,22.9,.11),road)
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
 if level>=1:
  box(part,(0,.125,z),(11.6,3.35,.14),floor)
  for xa,xb in [(-5.8,-4.35),(-2.90,2.175),(2.90,5.8)]:box(part,((xa+xb)/2,-2.075,z),(xb-xa,1.05,.14),floor)
  if level>=6:box(part,(-3.625,-2.075,z),(1.45,1.05,.14),floor)
 else:box(part,(0,-.4,z),(11.6,4.4,.14),floor)
 # Offices and teaching rooms: simple interpreted layouts, not surveyed rooms.
 for x in [-4.5,-2.4,-.3,1.8,4.1]:
  if level>0:box(part,(x,.6,z+.51),(.045,2.25,.9),concrete)
  for yy in [-1.55,.6]:
   if level in range(1,6) and x in [-4.5,-2.4] and yy==-1.55:continue
   box(part,(x,yy,z+.42),(1.25,.56,.055),wood)
   for dx in [-.48,.48]:box(part,(x+dx,yy,z+.24),(.035,.45,.38),dark)
   box(part,(x,yy+.16,z+.60),(.32,.045,.25),screen)
   box(part,(x,yy-.5,z+.24),(.28,.27,.06),dark)
   box(part,(x,yy-.64,z+.41),(.28,.045,.27),dark)
 for y in [-1.9,1.15]:
  box(part,(0,y,z+.94),(10.9,.035,.018),warm)
# Reinforced columns, beams and atrium gallery edge.
for x in [-5.4,-3.6,-1.8,0,1.8,3.6,5.4]:
 for y in [-2.15,1.35]:
  if not (x==-3.6 and y==-2.15):box('frame',(x,y,3.97),(.16,.16,7.28),concrete)
 for level in range(1,8):
  if x==-3.6 and level<6:box('frame',(x,.13,base+level*step-.09),(.13,3.19,.19),concrete)
  else:box('frame',(x,-.4,base+level*step-.09),(.13,4.25,.19),concrete)
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
cols=16;rows=12;w=11.6/cols;h=(top-1.46)/rows
portal_top=1.46+8*h;slit_bottom=1.46+2*h
for col in range(cols):
 x=-5.8+col*w
 for row in range(rows):
  z=1.46+row*h
  # Leave open geometry here, rather than putting a dark pane on the facade.
  if (col in [2,3] and row<8) or (col==11 and row>=2):continue
  frit_panel('shell',[(x,-2.645,z),(x+w,-2.645,z),(x+w,-2.645,z+h),(x,-2.645,z+h)])
for col in range(cols+1):
 x=col*w-5.8
 if col==3:box('shell',(x,-2.665,(portal_top+top)/2),(.010,.018,top-portal_top),pale)
 else:box('shell',(x,-2.665,4.58),(.010,.018,6.25),pale)
for row in range(rows+1):
 z=1.46+row*h
 for xa,xb in [(-5.8,-4.35),(-2.90,2.175),(2.90,5.8)]:box('shell',((xa+xb)/2,-2.67,z),(xb-xa,.024,.016),pale)
 if row>=8:box('shell',(-3.625,-2.67,z),(1.45,.024,.016),pale)
 if row<=2:box('shell',(2.5375,-2.67,z),(.725,.024,.016),pale)
# Deep bridge portal: dark returns, exposed upright supports and inset glazing.
# At bridge level the glazing is omitted entirely so the walkway enters a void.
for x in [-4.35,-2.90]:box('shell',(x,-2.09,(1.46+portal_top)/2),(.06,1.14,portal_top-1.46),dark)
box('shell',(-3.625,-2.09,portal_top),(1.51,1.14,.065),dark)
for z0,z1 in [(1.46,2.37),(3.48,4.47),(4.51,portal_top-.08)]:
 for j in range(3):box('shell',(-4.30+(j+.5)*.45,-1.56,(z0+z1)/2),(.435,.027,z1-z0),glint if j==1 else glass)
 for x in [-4.30,-3.85,-3.40,-2.95]:box('shell',(x,-1.59,(z0+z1)/2),(.020,.035,z1-z0),pale)
for x in [-4.25,-3.00]:box('shell',(x,-1.88,(1.46+portal_top)/2),(.085,.09,portal_top-1.46),concrete)
for z in [2.37,3.48,4.48]:box('shell',(-3.625,-1.91,z),(1.40,.11,.075),pale)
# Recess lighting and the reveal at the indoor end of the bridge.
for x in [-4.17,-3.075]:box('shell',(x,-1.94,portal_top-.085),(.024,.91,.015),soffit)
for x in [-4.15,-3.10]:box('shell',(x,-1.50,2.935),(.045,.14,1.09),pale)
box('shell',(-3.625,-1.50,3.48),(1.095,.14,.048),pale)
for x in [-3.88,-3.37]:
 box('shell',(x,-1.45,2.925),(.48,.025,1.025),glass)
 box('shell',(x,-1.483,2.96),(.016,.023,.23),pale)
# The second narrow cutout is also a recess, not a strip glued to the frit.
for x in [2.175,2.90]:box('shell',(x,-2.33,(slit_bottom+top)/2),(.045,.65,top-slit_bottom),dark)
box('shell',(2.5375,-2.01,(slit_bottom+top)/2),(.68,.025,top-slit_bottom),glass)
for z in [slit_bottom+i*1.04 for i in range(6) if slit_bottom+i*1.04<top]:
 box('shell',(2.5375,-2.32,z),(.70,.66,.047),dark)
 box('shell',(2.5375,-2.045,z+.03),(.70,.03,.026),pale)
box('shell',(2.54,-2.08,(slit_bottom+top)/2),(.06,.07,top-slit_bottom),concrete)
# Pattern wraps both ends, with atrium-facing windows at the back of E7.
for side in [-1,1]:
 x=side*5.82
 for j in range(5):
  y=-2.6+j*4.4/5
  for row in range(rows):
   z=1.46+row*h
   # The opposite end has the stacked clear window bands seen in the aerial.
   if side==-1 and j in [1,2,3] and row in [3,6,9]:
    box('shell',(x+.22,y+.44,z+h/2),(.027,.865,h-.018),glass)
    for zz in [z,z+h]:box('shell',(x+.10,y+.44,zz),(.24,.88,.035),dark)
    if j in [1,3]:box('shell',(x+.10,y+(.015 if j==1 else .865),z+h/2),(.24,.035,h),dark)
    box('shell',(x+.19,y+.44,z+h/2),(.035,.015,h),pale)
   else:frit_panel('shell',[(x,y,z),(x,y+4.4/5,z),(x,y+4.4/5,z+h),(x,y,z+h)])
 for yy in [-2.6+i*.44 for i in range(11)]:box('shell',(x+side*.012,yy,4.57),(.02,.02,6.25),pale)
 for row in range(rows+1):box('shell',(x, -.4,1.46+row*h),(.03,4.42,.017),pale)
 for y in [-2.3,-1.7,-1.1,-.5,.1,.7,1.3]:
  box('shell',(x if side==1 else x+.18,y,.87),(.025,.56,1.0),glass)
  if side==-1:box('shell',(x+.025,y-.29,.88),(.09,.045,1.10),pale)
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
# A shallower core leaves real depth behind the right-side portal.
box('context',(0,5.26,3.22),(11.6,2.08,5.94),dark)
for x in [-5.77,5.77]:box('context',(x,6.90,3.22),(.10,1.20,5.94),dark)
box('context',(0,5.85,6.28),(11.75,3.45,.18),roof)
# The two short ends use fritted panels and three horizontal window bands.
for side in [-1,1]:
 for j in range(4):
  y=4.22+j*.82
  for row in range(10):
   z=1.0+row*.52
   if (j>0 and row in [2,4,6]) or (side==-1 and j in [2,3] and row==3):box('context',(side*5.835,y+.40,z+.25),(.028,.79,.49),glass)
   else:frit_panel('context',[(side*5.825,y,z),(side*5.825,y+.815,z),(side*5.825,y+.815,z+.515),(side*5.825,y,z+.515)])
 for y in [4.22+i*.41 for i in range(9)]:box('context',(side*5.847,y,3.63),(.027,.012,5.24),pale)
 for z in [1.0+i*.52 for i in range(11)]:box('context',(side*5.848,5.85,z),(.025,3.3,.015),pale)
# Right elevation: the photographed two-storey recess above the stair,
# a continuous lower curtain wall, and exposed structural posts inside the void.
e5_cols=12;ew=11.6/e5_cols;px0=.9666667;px1=2.90;pz0=3.08;pz1=5.16
for col in range(e5_cols):
 x=-5.8+col*ew
 for row in range(10):
  z=1+row*.52
  if (row<4 and col<10) or (col in [7,8] and 4<=row<8):continue
  frit_panel('context',[(x,7.525,z),(x+ew,7.525,z),(x+ew,7.525,z+.52),(x,7.525,z+.52)])
# Split curtain-wall panels at the door opening; no pane crosses the doorway.
for i in range(32):
 x=-5.8+i*.3625;cx=x+.176;zt=3.08 if x<3.867 else 1.0
 levels=[.30,1.34,2.48,zt] if zt>1 else [.30,zt]
 for z0,z1 in zip(levels,levels[1:]):
  if z1<=z0:continue
  if .82<cx<3.16 and z0>=1.34 and z1<=2.48:continue
  box('context',(cx,7.51,(z0+z1)/2),(.349,.025,z1-z0-.022),glass if i%4 else glint)
 if not .82<x<3.16:box('context',(x,7.55,(.30+zt)/2),(.020,.04,zt-.30),pale)
 else:
  for z0,z1 in [(.30,1.34),(2.48,zt)]:box('context',(x,7.55,(z0+z1)/2),(.020,.04,z1-z0),pale)
for z in [.30,1.34,2.48,3.08]:
 xb=5.8 if z<=1 else 3.867
 box('context',((-5.8+xb)/2,7.55,z),(xb+5.8,.04,.030),pale)
for row in range(11):
 z=1+row*.52
 spans=[(3.867,5.8)] if row<4 else [(-5.8,px0),(px1,5.8)] if row<8 else [(-5.8,5.8)]
 for xa,xb in spans:box('context',((xa+xb)/2,7.548,z),(xb-xa,.025,.018),pale)
for col in range(e5_cols+1):
 x=-5.8+col*ew
 z0=3.08 if col<10 else 1.0
 if col==8:z0=pz1
 box('context',(x,7.548,(z0+6.20)/2),(.012,.024,6.20-z0),pale)
# Dark jambs and soffit wrap into a recessed, glazed interior gallery.
for x in [px0,px1]:box('context',(x,7.085,(pz0+pz1)/2),(.055,.88,pz1-pz0),dark)
for z in [pz0,pz1]:box('context',((px0+px1)/2,7.085,z),(px1-px0,.88,.060),dark)
for j in range(5):
 x=px0+(j+.5)*(px1-px0)/5
 for z0,z1 in [(pz0+.07,4.11),(4.19,pz1-.06)]:box('context',(x,6.64,(z0+z1)/2),(.365,.025,z1-z0),glint)
 box('context',(x-.185,6.69,(pz0+pz1)/2),(.019,.028,pz1-pz0),pale)
# These are physical concrete posts, visible against the shadowed recess.
for x in [1.10,2.77]:
 box('context',(x,6.99,(pz0+pz1)/2),(.085,.11,pz1-pz0),concrete)
 box('context',(x,7.23,4.15),(.07,.58,.080),pale)
box('context',((px0+px1)/2,6.99,4.15),(px1-px0,.12,.09),concrete)
for x in [1.32,1.73,2.14,2.55]:box('context',(x,7.05,pz1-.054),(.022,.74,.012),soffit)
box('context',((px0+px1)/2,7.52,pz0+.33),(px1-px0,.022,.024),pale)
for i in range(10):box('context',(px0+.08+i*.196,7.52,pz0+.17),(.013,.020,.31),pale)
# Slender columns and transoms articulate the lower, two-storey glass wall.
for x in [-5.74,-4.29,-2.84,-1.39,.77,3.19,3.84]:box('context',(x,7.565,1.69),(.047,.065,2.78),pale)
# Recessed entry returns connect the raised stair landing into the curtain wall.
for x in [.81,3.19]:box('context',(x,7.36,1.91),(.05,.36,1.16),dark)
box('context',(2,7.35,2.49),(2.42,.40,.055),dark)
box('context',(2,7.41,1.34),(2.44,.48,.065),concrete)
# Atrium-facing E5 glazing and coloured study niches remain on the inner face.
for level in range(6):
 z=.35+level*.98
 for x in [i*.7-5.25 for i in range(16)]:box('context',(x,4.18,z+.48),(.66,.025,.78),glass)
 box('context',(0,4.14,z+.92),(11.65,.07,.10),pale)
 for i,x in enumerate([-4.5,-2.5,2.5,4.5]):box('atrium',(x,4.08,z+.45),(1.1,.055,.70),[yellow,orange,dark,yellow][(i+level)%4])

# Seven-storey atrium: open volume, glazed galleries and boxed red feature stairs.
box('interior',(0,3,.28),(11.6,2.4,.13),floor)
for level in range(1,7):
 z=base+level*step
 for y in [1.98,4.01]:
  box('atrium',(0,y,z),(11.58,.40,.13),concrete)
  box('atrium',(0,y,z-.072),(10.9,.025,.014),soffit)
  box('atrium',(0,y,z+.39),(11.6,.024,.032),pale)
  for x in [i*.7-5.6 for i in range(17)]:
   box('atriumglass',(x,y,z+.20),(.68,.016,.36),railglass)
   box('atrium',(x,y,z+.2),(.018,.025,.4),pale)
 for x in [-4.6,4.6]:
  box('atrium',(x,3,z),(1.02,2.35,.16),concrete)
  box('atrium',(x,3,z-.086),(.028,2.1,.014),soffit)
  for xx in [x-.49,x+.49]:
   box('atrium',(xx,3,z+.39),(.026,2.32,.028),pale)
   box('atriumglass',(xx,3,z+.20),(.018,2.30,.35),railglass)
   for yy in [2,2.5,3,3.5,4]:box('atrium',(xx,yy,z+.20),(.02,.025,.38),pale)
 # The flights rise between alternating large landings, as in the supplied section.
 x0=-1.65 if level%2 else 1.65;x1=-x0;z0=base+(level-1)*step;z1=z
 for n in range(18):
  t=(n+.5)/18;x=x0+(x1-x0)*t;zz=z0+(z1-z0)*(n+1)/18
  box('atrium',(x,3.28,zz),(.195,.79,.055),floor)
 for yy in [2.85,3.71]:
  beam('atrium',(x0,yy,z0+.18),(x1,yy,z1+.18),.058,.47,red)
  tube('atrium',[(x0,yy,z0+.47),(x1,yy,z1+.47)],.012,pale,6)
 beam('atrium',(x0,3.28,z0-.045),(x1,3.28,z1-.045),.76,.028,soffit)
 box('atrium',(x1,3.28,z1-.04),(1.20,1.17,.20),red)
 box('atrium',(x1,3.28,z1-.145),(1.07,1.05,.015),soffit)
 for yy in [2.70,3.86]:box('atrium',(x1,yy,z1+.18),(1.20,.055,.44),red)
 end=x1+(.58 if x1>0 else -.58)
 box('atrium',(end,3.28,z1+.18),(.055,1.18,.44),red)
 for yy in [2.94,3.28,3.62]:box('atrium',(x1,yy,z1-.157),(1.04,.015,.012),pale)
# Charcoal acoustic panels and clerestory light slots frame the red stairs.
for level in range(1,7):
 z=base+level*step
 for x in [-3.4,0,3.4]:
  box('atrium',(x,4.115,z+.57),(3.25,.035,.86),annex)
  box('atrium',(x,4.088,z+.62),(1.75,.014,.07),soffit)

# Glazed atrium ends, mullions, doors. They can peel away independently.
for x in [-5.86,5.86]:
 for j in range(5):
  y=1.83+j*.47
  box('atriumshell',(x,y+.22,4.72),(.025,.44,6.02),glint)
  box('atriumshell',(x,y,4.72),(.055,.022,6.02),pale)
 for level in range(2,8):box('atriumshell',(x,3,base+level*step),(.065,2.43,.025),pale)
# Pearl Sullivan entrance: sheltered recess, glazed doors, dark panel returns.
for y in [1.86,4.14]:box('entrance',(5.90,y,.97),(.62,.10,1.45),annex)
box('entrance',(5.93,3,1.63),(.80,2.42,.12),dark)
box('entrance',(6.34,3,1.68),(.035,2.47,.22),pale)
label('entrance','PEARL SULLIVAN ENGINEERING BUILDING',(6.365,3,1.657),.068,dark,rotation=(math.pi/2,0,math.pi/2))
for j in range(6):
 y=1.99+j*.405
 box('entrance',(5.61,y,.83),(.024,.376,1.10),glass)
 for yy in [y-.192,y+.192]:box('entrance',(5.635,yy,.84),(.045,.028,1.12),pale)
 for z in [.29,1.11,1.39]:box('entrance',(5.64,y,z),(.045,.394,.025),pale)
 if j in [1,2,3,4]:box('entrance',(5.672,y+.11,.82),(.045,.014,.21),pale)
for y in [2.16,2.98,3.80]:box('entrance',(5.95,y,1.557),(.52,.025,.012),soffit)
box('entrance',(5.84,3,.27),(.7,2.27,.035),floor)
# Rear entrance is a real door assembly in the lower glazed atrium wall.
for y in [1.86,4.14]:box('entrance',(-5.86,y,.97),(.18,.09,1.45),annex)
box('entrance',(-5.96,3,1.59),(.37,2.40,.085),pale)
box('entrance',(-6.0,3,1.54),(.25,2.28,.025),dark)
for j in range(6):
 y=1.98+j*.405
 box('entrance',(-5.884,y,.86),(.028,.377,1.14),glass)
 for yy in [y-.193,y+.193]:box('entrance',(-5.911,yy,.87),(.047,.025,1.17),pale)
 for z in [.29,1.19,1.45]:box('entrance',(-5.916,y,z),(.047,.395,.027),pale)
 if j in [2,3]:
  box('entrance',(-5.946,y,.83),(.050,.017,.24),pale)
  box('entrance',(-5.947,y,.51),(.035,.34,.08),pale)
box('entrance',(-5.996,3,.26),(.30,2.33,.025),floor)
box('entrance',(-6.025,3,1.485),(.035,.37,.012),soffit)
# Accessible-door push plate and a flush threshold at the rear walk.
box('entrance',(-5.961,4.055,.80),(.025,.058,.072),blue)
for y in [2.10,3.90]:
 cylinder('site',(-6.17,y,.52),.031,.57,pale,12)
 cylinder('site',(-6.17,y,.81),.034,.025,dark,12)
# Distinctive sawtooth roof with tall clerestory lights, spanning the atrium.
for i in range(10):
 x=-5.85+i*1.17
 mesh('atriumroof',pale,[(x,1.78,7.74),(x+1.03,1.78,8.21),(x+1.03,4.23,8.21),(x,4.23,7.74)],[(0,1,2,3)])
 box('atriumroof',(x+1.055,3,7.99),(.035,2.46,.46),glint)
 for yy in [1.79,3,4.22]:beam('atriumroof',(x,yy,7.73),(x+1.07,yy,8.24),.045,.065,pale)
# Atrium furniture, donor wall, ground-floor Ideas Clinic / robotics interpretation.
box('interior',(-4.86,1.855,1.05),(1.25,.045,.75),dark)
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
def enclosed_walkway(path):
 edges=[]
 for i,p in enumerate(path):
  prev=Vector(path[max(0,i-1)]);nxt=Vector(path[min(len(path)-1,i+1)]);d=(nxt-prev).normalized();n=Vector((-d.y,d.x))
  edges.append((Vector(p)-n*.47,Vector(p)+n*.47))
 for i in range(len(path)-1):
  for z,thick,mat in [(2.32,.16,concrete),(3.43,.07,dark)]:
   a,b=edges[i];c,d=edges[i+1]
   verts=[(v.x,v.y,zz) for zz in [z-thick/2,z+thick/2] for v in [a,c,d,b]]
   mesh('bridge',mat,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
  for side in [0,1]:
   a=edges[i][side];b=edges[i+1][side];count=max(1,round((b-a).length/.3))
   for j in range(count):
    p=a+(b-a)*j/count;q=a+(b-a)*(j+1)/count
    beam('bridge',(p.x,p.y,2.89),(q.x,q.y,2.89),.021,.98,glass if (i+j)%4 else glint)
    beam('bridge',(p.x,p.y,2.40),(p.x,p.y,3.44),.025,.032,pale)
   beam('bridge',(a.x,a.y,3.39),(b.x,b.y,3.39),.036,.04,pale)
   beam('bridge',(a.x,a.y,2.40),(b.x,b.y,2.40),.036,.065,pale)
 # Floor finish and roof flashing run continuously through the curved entry.
 for i in range(len(path)-1):
  a,b=edges[i];c,d=edges[i+1]
  mesh('bridge',floor,[(v.x,v.y,2.405) for v in [a,c,d,b]],[(0,1,2,3)])
path=[(-11.3,-3.30),(-9.8,-3.30),(-8.3,-3.30),(-6.8,-3.30),(-5.45,-3.30),(-4.70,-3.25),(-4.15,-3.05),(-3.80,-2.70),(-3.625,-2.26),(-3.625,-1.53)]
enclosed_walkway(path)
# Piers sit on the sidewalks, leaving the road clear beneath the span.
for x in [-10.73,-6.12]:
 cylinder('bridge',(x,-3.30,1.20),.14,2.18,concrete,18)
 box('bridge',(x,-3.30,2.265),(.37,.70,.11),concrete)
# A slim shadow joint inside the reveal, not a glass wall capping the bridge.
for x in [-4.12,-3.13]:box('bridge',(x,-1.64,2.92),(.032,.032,1.05),dark)
box('bridge',(-3.625,-1.64,3.445),(1.02,.07,.030),pale)
# One left-side bridge only, following the user's clarified site layout.
# Attached dark wing returns from the companion building to the street.
# It meets the E5 wall at x=5.825; its side terminates the canopy at y=4.60.
box('annex',(8.80,6.08,1.54),(6.16,3.02,2.56),annex)
box('annex',(8.80,6.08,2.86),(6.24,3.10,.08),dark)
# Only the exposed end and rear retain charcoal cladding; the entire courtyard
# face connecting to E7 is reflective glass from the plinth to the roofline.
for y in [4.58+i*.5 for i in range(7)]:box('annex',(11.887,y,1.54),(.016,.012,2.54),dark)
for z in [.27,.91,1.55,2.19,2.81]:box('annex',(11.89,6.08,z),(.015,3.02,.012),dark)
for i in range(11):
 x=5.725+i*.560
 box('annexglass',(x+.273,4.545,1.54),(.546,.026,2.54),wingglass)
 box('annex',(x,4.515,1.54),(.020,.045,2.57),pale)
for z in [.265,2.805]:box('annex',(8.80,4.516,z),(6.18,.045,.028),pale)
# The photo's Waterloo Engineering wall sign: mirror panels, deep metal letters,
# and a narrow planted stone trough. This is mounted to the wing, not freestanding.
# Thin, subtly rippled stainless-steel sheets distort courtyard reflections like
# the supplied sign photo. The surface is geometry, not a white graphic panel.
box('sign',(8.76,4.471,1.28),(4.94,.03,1.85),dark)
for panel in range(4):
 x0=6.29+panel*1.235;verts=[];faces=[];nx=16;nz=24
 for iz in range(nz+1):
  z=.355+iz*1.85/nz
  for ix in range(nx+1):
   x=x0+.004+ix*1.227/nx
   ripple=.020*math.sin(x*4.2+z*1.7)+.015*math.sin(x*9.4-z*6.3)+.006*math.cos(x*19+z*9)
   verts.append((x,4.407+ripple,z))
 for iz in range(nz):
  for ix in range(nx):
   n=iz*(nx+1)+ix;faces.append((n,n+1,n+nx+2,n+nx+1))
 mesh('signback',mirror,verts,faces)
for x in [6.29,7.53,8.77,10.01,11.23]:box('sign',(x,4.407,1.28),(.009,.006,1.85),dark)
for x in [6.28,11.24]:box('sign',(x,4.445,1.28),(.018,.045,1.86),mirror)
label('sign','WATERLOO',(8.76,4.342,1.43),.70,signface,depth=.050,width=4.20,bold=True)
label('sign','ENGINEERING',(8.76,4.342,.73),.57,signface,depth=.050,width=4.20,bold=True)
box('site',(8.77,4.18,.34),(5.20,.43,.20),concrete)
box('site',(8.77,4.18,.447),(5.08,.32,.024),soil)

# Wide flat cycle pavilion spans the front of E7 and the atrium entrance.
# It joins the side of the dark wing, never crossing in front of the wing's face.
for x in [9.25,11.61]:
 for y in [-2.43,-1.03,.37,1.77,3.17,4.56]:
  box('site',(x,y,.32),(.20,.20,.17),concrete)
  box('site',(x,y,1.04),(.073,.073,1.35),dark)
 box('site',(x,1.06,1.76),(.075,7.23,.075),dark)
for y in [-2.52+i*.59 for i in range(13)]:
 box('site',(10.43,y,1.79),(2.51,.032,.045),pale)
for j in range(12):
 y=-2.215+j*.59
 box('canopyglass',(10.43,y,1.815),(2.47,.562,.014),canopyglass)
for y in [-2.43,1.77,4.56]:box('site',(10.43,y,1.715),(2.18,.023,.012),soffit)
# A stone entry path passes through the racks opposite the atrium doors.

# Cycle racks align with the canopy length; the open forecourt remains clear.
for x in [9.72,11.0]:
 for j in range(10):
  y=-2.10+j*.60
  if 1.55<y<3.7:continue
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
for j in range(12):
 y=[-2.1,-1.48,-.86,-.24,.38,1.0][j%6]
 bicycle(9.73 if j<6 else 11.02,y,math.pi/2+random.uniform(-.12,.12),[dark,blue,red,pale][j%4])
# Reference-like sign on the front column and simple concrete seating at the wing.
box('site',(11.66,-2.43,.76),(.04,.29,.26),pale)
label('site','CYCLE',(11.683,-2.43,.80),.048,dark,rotation=(math.pi/2,0,math.pi/2))
for y in [.35,1.9]:
 box('site',(6.45,y,.39),(.40,.94,.30),concrete)
for x,y in [(6.4,-2.85),(7.15,-2.85),(7.9,-2.85)]:cylinder('site',(x,y,.45),.022,.42,pale,8)
# Broad stepped entrance from e5_exterior_neighbour_context_2010.jpg.
# Author the stair locally and turn it onto the long outer E5 facade per the plan.
stair_starts={key:len(values[0]) for key,values in B.items()}
# The modeled ground rises beside E5; the bridge road at y=-2.95 stays clear.
paved_area(-10.28,-6.26,3.76,7.57,.65)
box('site',(-6.11,5.65,.83),(.65,2.50,1.15),concrete)
# Fourteen shallow risers separated by a broad intermediate landing.
for n in range(14):
 x=-9.77+n*.218+(0.48 if n>=7 else 0)
 height=(n+1)*.078
 box('site',(x+.109,5.65,.24+height/2),(.224,2.32,height),concrete)
 box('site',(x+.017,5.65,.24+height+.004),(.018,2.28,.010),pale)
box('site',(-8.004,5.65,.513),(.49,2.32,.546),concrete)
# At the top, a glazed vestibule connects the steps into the companion building.
for y in [4.58,5.12,5.66,6.20,6.74]:box('context',(-5.43,y,1.91),(.038,.027,1.14),pale)
for z in [1.35,2.24,2.48]:box('context',(-5.43,5.65,z),(.038,2.18,.027),pale)
for y in [5.39,5.92]:box('context',(-5.465,y,1.92),(.055,.018,.22),pale)
for y in [4.85,5.39,5.93,6.47]:box('context',(-5.41,y,1.91),(.025,.50,1.08),glass)
for y in [4.50,5.65,6.80]:
 points=[(-10.02,y,.63),(-9.77,y,.63),(-8.24,y,1.18),(-7.76,y,1.18),(-6.23,y,1.72),(-5.88,y,1.72)]
 tube('site',points,.015,pale,8)
 for x,z in [(-9.70,.30),(-8.75,.62),(-8.10,.786),(-7.48,.93),(-6.52,1.23),(-5.98,1.36)]:cylinder('site',(x,y,z+.18),.012,.37,pale,8)
# Solid retaining cheeks sit against the terrain; no thin triangular grass strips.
for y in [4.32,6.98]:
 xa=-9.85;xb=-6.23;ya=y-.07;yb=y+.07
 verts=[(xa,ya,.23),(xb,ya,.23),(xb,yb,.23),(xa,yb,.23),(xa,ya,.35),(xb,ya,1.43),(xb,yb,1.43),(xa,yb,.35)]
 mesh('site',concrete,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
# Local stair X travel becomes -Y travel toward the outer E5 facade.
for key,(verts,faces) in B.items():
 for i in range(stair_starts.get(key,0),len(verts)):
  x,y,z=verts[i];verts[i]=(7.65-y,1.78-x,z)
 for i,face in enumerate(faces):
  if face and min(face)>=stair_starts.get(key,0):faces[i]=tuple(reversed(face))
# One gently graded landscape surface per side, easing into the level footpath.
# Vertex colours blend mulch, low cover and lawn without flat triangular patches.
paved_area(-6.0,6.0,11.72,12.00,.80)
paved_area(-6.0,.15,12.00,12.65,.80)
paved_area(3.85,6.0,12.00,12.65,.80)
# A dropped kerb carries the stair approach smoothly from sidewalk to asphalt.
# The grass finishes at the sidewalk; the road remains level and unobstructed.
for xa,xb in [(-6.0,.40),(3.60,6.0)]:box('site',((xa+xb)/2,12.64,.19),(xb-xa,.12,.15),concrete)
for j in range(10):
 ya=12.00+j*.065;yb=ya+.065
 def ramp_z(y):
  t=max(0,min(1,(y-12.00)/.65));return .239-.115*t*t*(3-2*t)
 mesh('site',concrete,[(.50,ya,ramp_z(ya)),(3.50,ya,ramp_z(ya)),(3.50,yb,ramp_z(yb)),(.50,yb,ramp_z(yb))],[(0,1,2,3)])
 for xa,xb in [(.15,.50),(3.50,3.85)]:
  inner=xb if xa<1 else xa;outer=xa if xa<1 else xb
  mesh('site',concrete,[(outer,ya,.239),(inner,ya,ramp_z(ya)),(inner,yb,ramp_z(yb)),(outer,yb,.239)],[(0,1,2,3)] if xa<1 else [(3,2,1,0)])
terrain_mat=material('Graded planted earth',(.23,.29,.15),.98)
terrain_bsdf=M[terrain_mat].node_tree.nodes.get('Principled BSDF')
terrain_colors=M[terrain_mat].node_tree.nodes.new('ShaderNodeVertexColor');terrain_colors.layer_name='Color'
M[terrain_mat].node_tree.links.new(terrain_colors.outputs['Color'],terrain_bsdf.inputs['Base Color'])
TC=[]
def bank_height(x,y):
 t=max(0,min(1,(11.72-y)/4.14));ease=t*t*(3-2*t)
 edge=max(0,min(1,(5.8-abs(x))/.78));edge=edge*edge*(3-2*edge)
 undulation=.020*math.sin(x*3.7+y*1.2)*math.sin(y*2.8)*math.sin(math.pi*t)
 return .246+1.024*ease*edge+undulation
for xa,xb in [(-5.8,.79),(3.23,5.8)]:
 nx=round((xb-xa)*6);ny=24;verts=[];faces=[]
 for j in range(ny+1):
  y=7.58+j*4.14/ny
  for i in range(nx+1):
   x=xa+i*(xb-xa)/nx;z=bank_height(x,y);verts.append((x,y,z))
   # Broad mottled planting transitions, never random contrasting triangle faces.
   noise=.50+.22*math.sin(x*1.7+y*.94)+.15*math.cos(y*2.7-x*.7)+.06*math.sin(x*8+y*3)
   foot=max(0,min(1,(y-10.4)/1.2));cover=max(0,min(1,noise*.60+foot*.38))
   dirt=(.20,.174,.12);green=(.16,.24,.085)
   TC.append(tuple(dirt[k]*(1-cover)+green[k]*cover for k in range(3))+(1,))
 for j in range(ny):
  for i in range(nx):
   n=j*(nx+1)+i;faces.append((n,n+1,n+nx+2,n+nx+1))
 mesh('terrain',terrain_mat,verts,faces)
 # Flush steel edging follows the organic grade at the base instead of a white wall.
 box('site',((xa+xb)/2,11.72,.249),(xb-xa,.025,.038),dark)
 # The wall plinth is exposed above the soil only where the grade falls at the ends.
 box('site',((xa+xb)/2,7.53,.72),(xb-xa,.10,.88),concrete)
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
for x,y,s in [(-10.86,.8,.90),(-10.86,4.7,1.0),(-10.86,8.1,.92),(12.63,8.85,.85),(-5.5,13.08,.92),(5.25,13.08,.94),(-1.5,-3.14,.52),(3.4,-3.14,.56)]:tree(x,y,s)
# Low hedge below the mirrored sign, with no new texture or draw-call cost.
for i in range(350):
 x=random.uniform(6.24,11.30);y=random.uniform(4.04,4.30);z=random.uniform(.46,.57)
 leaf_surface((x,y,z),random.uniform(.045,.075),foliage[i%3])
# Tufts emerge from the same graded surface; no floating leaf planes or sharp lawn strip.
for i in range(850):
 x=random.uniform(3.32,5.72) if i%3==0 else random.uniform(-5.72,.70)
 y=random.uniform(7.66,11.68);z=bank_height(x,y)
 for j in range(4):
  a=random.random()*math.tau;h=random.uniform(.035,.13);w=random.uniform(.006,.014)
  dx=math.cos(a);dy=math.sin(a)
  mesh('foliage',foliage[(i+j)%3],[(x-dy*w,y+dx*w,z),(x+dy*w,y-dx*w,z),(x+dx*h*.28,y+dy*h*.28,z+h*.70),(x+dx*h*.55,y+dy*h*.55,z+h)],[(0,1,2),(0,2,3)])
# Low groundcover clusters soften the transition beside the entry landing.
for i in range(180):
 x=random.uniform(-5.4,.58) if i%3 else random.uniform(3.45,5.4)
 y=random.uniform(7.80,10.8);z=bank_height(x,y)
 for j in range(4):
  a=j*math.pi/2+i*.43
  leaf_surface((x+math.cos(a)*.05,y+math.sin(a)*.05,z+.04),.055,foliage[(i+j)%3])

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
# Slender side lighting poles with disc luminaires and concrete footings.
# Keep all fittings on footpaths, outside the road beneath the left bridge.
for x,y in [(-10.72,-6.5),(-10.72,3.1),(-10.72,10.9),(-4.5,12.97),(0,12.97),(4.6,12.97),(12.35,-2.5),(12.35,8.1)]:
 cylinder('site',(x,y,.28),.115,.19,concrete,12)
 cylinder('site',(x,y,1.52),.028,2.48,dark,12)
 cylinder('site',(x,y,2.785),.15,.038,pale,16)
 cylinder('site',(x,y,2.756),.115,.018,soffit,16)
 cylinder('site',(x,y,2.818),.068,.025,dark,12)
# Short stainless bollards define pedestrian edges beside the canopy and stairs.
for x,y in [(12.08,-1.0),(12.08,1.0),(12.08,3.0),(-1.0,12.13),(0.3,12.13),(3.7,12.13),(5.0,12.13),(-6.08,-1.0),(-6.08,.4)]:
 cylinder('site',(x,y,.48),.031,.46,pale,10)
 cylinder('site',(x,y,.716),.034,.022,dark,10)
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
 if part=='terrain':
  colors=data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
  for i,col in enumerate(TC):colors.data[i].color=col
 if part in ['landscape','signback','terrain']:
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
scene.render.resolution_x=1600;scene.render.resolution_y=1200;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='WEBP';scene.render.image_settings.quality=88;scene.render.filepath=os.path.join(OUT,'engineering-7-poster.webp')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE,'engineering-7.blend'));bpy.ops.render.render(write_still=True)
# Blender saves the poster too: avoid ever shipping a stale loading image.
assets={key:'/models/'+filename+'?v='+hashlib.sha256(open(os.path.join(OUT,filename),'rb').read()).hexdigest()[:12] for key,filename in [('model','engineering-7.glb'),('poster','engineering-7-poster.webp')]}
manifest=os.path.join(ROOT,'src','app','(site)','home','scene-assets.json')
with open(manifest,'w',encoding='utf-8') as f:json.dump(assets,f,indent=2);f.write('\n')
print('ASTRA_E7_MODEL_COMPLETE')
