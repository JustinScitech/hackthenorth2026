import bpy, math, random, os
from mathutils import Vector
random.seed(42)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'models')
os.makedirs(OUT, exist_ok=True)
SOURCE = os.path.join(ROOT, 'assets', 'astra')
os.makedirs(SOURCE, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def mat(name, color, rough=.65, metal=0, emission=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metal
    if emission: p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=emission
    return m
concrete=mat('Warm limestone',(.48,.48,.43)); trim=mat('Pale concrete',(.69,.70,.64))
roof=mat('Standing seam roof',(.21,.25,.24),.82); dark=mat('Powder coated charcoal',(.075,.09,.086),.4,.4)
glass=mat('Smoked architectural glazing',(.085,.16,.15),.2,.55)
warm=mat('Occupied windows',(.64,.46,.23),.32,.1,.42)
asphalt=mat('Asphalt',(.07,.082,.082),.95); white=mat('Road markings',(.57,.60,.54))
grass=mat('Landscape',(.075,.14,.087),.97); bark=mat('Tree bark',(.15,.12,.085))
leaves=[mat('Foliage '+str(i),c,.95) for i,c in enumerate([(.11,.19,.105),(.15,.23,.12),(.2,.27,.135),(.095,.145,.083)])]
brick=mat('Warehouse brick',(.30,.19,.14)); water=mat('Drainage water',(.055,.19,.19),.2,.45)
red=mat('Fire hydrant',(.5,.14,.07),.4,.3); steel=mat('Galvanized steel',(.36,.4,.39),.38,.6)
green=mat('Astra green',(.08,.57,.32),.4,.2,.28)

def cube(name,loc,scale,material,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.name=name; o.dimensions=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(material)
    if bevel:
        mod=o.modifiers.new('Edge highlights','BEVEL'); mod.width=bevel; mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL'); bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def cyl(name,loc,r,depth,material,vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=loc)
    o=bpy.context.object; o.name=name; o.data.materials.append(material)
    for p in o.data.polygons:p.use_smooth=True
    return o

def text(name,body,loc,size,material):
    bpy.ops.object.text_add(location=loc,rotation=(math.pi/2,0,0)); o=bpy.context.object; o.name=name
    o.data.body=body; o.data.size=size; o.data.extrude=.001; o.data.align_x='CENTER'; o.data.materials.append(material)
    bpy.ops.object.convert(target='MESH')

# An intentionally compact architectural site, with a finished sectional edge.
cube('Site foundation',(0,0,-.48),(20,16,.8),dark,.16)
cube('Site concrete edge',(0,0,-.05),(19.95,15.95,.18),concrete,.05)
cube('Main site',(0,1.5,.08),(19.6,12.5,.12),asphalt)
cube('Street',(0,-5.7,.09),(19.8,4.3,.12),asphalt)
for y in [-7.55,-3.6]: cube('Street curb',(0,y,.19),(19.8,.16,.22),trim,.035)
for x in range(-9,10,2): cube('Lane divider',(x,-5.75,.158),(.88,.045,.012),white)
for x in [-7.5,-7.15,-6.8,-6.45,-6.1]: cube('Pedestrian crossing',(x,-5.75,.17),(.18,3.45,.02),white)
# Paving and planted perimeter.
cube('Building plinth',(-1,1.35,.22),(10.6,7.3,.3),concrete,.055)
for x in [-5.9,3.9]: cube('Long planter',(x,1.5,.36),(.7,6.2,.45),concrete,.045); cube('Planter soil',(x,1.5,.6),(.59,6.05,.04),grass)
cube('Entry walk',(-1,-2.85,.22),(9.1,1.1,.18),trim)
for x in range(-5,4): cube('Paving joints',(x,-2.85,.317),(.014,1.1,.005),dark)
# Main commercial property: a taller glazed office frontage and a production wing.
# Real wall thickness and an inspectable interior, rather than a solid block.
cube('SHELL rear wall',(-1,4.25,1.9),(8.6,.22,3.25),concrete,.035)
cube('SHELL west wall',(-5.18,1.5,1.9),(.22,5.7,3.25),concrete,.035)
cube('Interior floor',(-1,1.5,.4),(8.35,5.45,.18),trim,.02)
for x in [-4.65,-1.9,.85,2.85]:
    for y in [-.8,3.8]:
        cube('FRAME steel column',(x,y,1.94),(.14,.14,3.05),steel,.015)
        cube('FRAME base plate',(x,y,.55),(.32,.32,.08),dark,.012)
    cube('FRAME transverse beam',(x,1.5,3.34),(.14,4.75,.22),steel,.01)
for y in [-.8,1.5,3.8]:cube('FRAME longitudinal beam',(-.9,y,3.38),(7.85,.13,.24),steel,.01)
for x in [-3.6,-.9,1.8]:
    cube('Interior workstation',(x,2.8,.89),(1.4,.7,.85),dark,.03)
    cube('Interior work surface',(x,2.8,1.34),(1.5,.8,.08),steel,.02)
    cube('Interior machine',(x,2.9,1.7),(.62,.48,.65),glass,.04)
    cube('Interior control panel',(x,2.64,1.72),(.27,.02,.2),warm,.01)
    for yy in [.1,.62]:
        cube('Interior pallet',(x,yy,.57),(1.2,.45,.14),bark,.015)
        for dx in [-.4,0,.4]:cube('Interior inventory',(x+dx,yy,.89),(.34,.35,.51),concrete,.015)
for x in [-4.6,2.8]:
    cube('Interior safety aisle',(x,1.4,.505),(.05,3.8,.009),white)
cube('Interior office partition',(-3.5,-.7,1.35),(2.6,.06,1.8),glass,.015)
cube('Interior desk',(-3.6,-.3,1),(1.4,.6,.08),bark,.015)
for x in [-4.1,-3.1]:cube('Interior desk leg',(x,-.3,.7),(.06,.4,.6),steel)

cube('Roof membrane',(-1,1.5,3.58),(8.74,5.84,.16),roof,.03)
for x in [-5.32,3.32]:cube('Roof parapet',(x,1.5,3.78),(.16,5.88,.34),trim,.018)
for y in [-1.4,4.4]:cube('Roof parapet',(-1,y,3.78),(8.8,.16,.34),trim,.018)
for x in range(23):cube('Roof seam',(-5.1+x*.37,1.5,3.676),(.023,5.4,.025),steel)
# Recessed curtain walls, mullions, thin architectural bands.
for floor in range(2):
    for i in range(10):
        x=-4.88+i*.87; z=1.04+floor*1.38
        cube('Front glazing',(x,-1.366,z),(.78,.035,1.05),warm if (i+floor*3)%7==0 else glass)
        cube('Window mullion',(x+.414,-1.402,z),(.045,.07,1.24),dark)
    for i in range(6):
        y=-.9+i*.87; z=1.04+floor*1.38
        cube('Side glazing',(3.316,y,z),(.035,.77,1.05),warm if i%4==0 else glass)
        cube('Side mullion',(3.35,y+.41,z),(.065,.045,1.25),dark)
for z in [.42,1.73,3.1]:
    cube('Front floor band',(-1,-1.47,z),(8.9,.2,.17),trim,.015)
    cube('Side floor band',(3.41,1.5,z),(.2,5.94,.17),trim,.015)
for x in [-5.35,-1,3.35]:cube('Facade pier',(x,-1.5,1.79),(.19,.23,2.85),trim,.025)
cube('Entrance portal',(-.9,-1.65,1.33),(2.05,.46,2.05),dark,.045)
cube('Entry glass',(-.9,-1.9,1.22),(1.8,.045,1.8),glass)
cube('Door stile',(-.9,-1.938,1.22),(.055,.035,1.8),steel)
for x in [-1.04,-.76]:cube('Door handle',(x,-1.973,1.12),(.025,.04,.3),trim)
cube('Floating canopy',(-.9,-2.03,2.4),(3.3,1.4,.16),trim,.04)
cube('Canopy underlight',(-.9,-2.6,2.30),(2.9,.026,.024),warm)
text('Tenant sign','N O R T H L I N E',(-1,-1.594,3.20),.23,dark)
# Roof plant: equipment, fan housings, ducts, vents.
for x,y in [(-3,2.4),(-.4,2.4)]:
    cube('HVAC base',(x,y,3.83),(1.7,1.22,.26),dark,.04)
    cube('HVAC casing',(x,y,4.1),(1.5,1,.42),steel,.045)
    for dx in [-.4,.4]:
        cyl('Roof fan',(x+dx,y,4.335),.26,.055,dark,20)
        for a in range(4):
            fan=cube('Fan blade',(x+dx,y,4.37),(.36,.035,.013),steel); fan.rotation_euler.z=a*math.pi/4
    for j in range(7):cube('Louver',(x-.6+j*.2,y-.505,4.12),(.035,.025,.3),dark)
cube('Roof duct',(1.7,2,3.96),(.42,2.3,.48),steel,.045)
for y in [1.1,2,2.9]:cube('Duct seam',(1.7,y,3.97),(.46,.035,.51),dark,.012)
for x in [-4.1,2.5]:cyl('Vent stack',(x,3.6,4.02),.105,.65,steel);cyl('Vent cap',(x,3.6,4.37),.17,.08,dark)
# Serviceable rooftop details: access hatch, flashing, drainage and patching.
cube('Roof access hatch',(-3.6,.15,3.77),(1.05,.78,.18),dark,.045)
cube('Roof hatch lid',(-3.6,.15,3.9),(.99,.72,.09),steel,.025)
for x,y in [(-3.9,1.1),(1.9,.1)]:
    cube('Roof maintenance patch',(x,y,3.682),(.7,.8,.016),dark,.012)
for y in [-1.5,4.5]:cube('Gutter',(-1,y,3.49),(8.5,.10,.10),steel,.025)
for x in [-5.35,3.4]:
    for y in [-1.35,4.35]:
        cyl('Downspout',(x,y,1.95),.045,3.0,steel)
for z in [.8,1.2,1.6,2,2.4,2.8,3.2]:
    cube('Service ladder rung',(-5.36,3.2,z),(.11,.5,.03),steel)
for y in [2.96,3.44]:cube('Service ladder rail',(-5.36,y,2.02),(.08,.03,2.72),steel)
# Neighboring masonry warehouse with articulated industrial facade.

cube('Neighbor warehouse',(6.1,4,1.55),(3.4,5.1,2.8),brick,.045)
cube('Warehouse roof',(6.1,4,3),(3.65,5.35,.24),roof,.045)
for y in [1.4,6.6]:cube('Warehouse roof lip',(6.1,y,3.15),(3.66,.1,.13),steel)
for z in [.6,.85,1.1,1.35,1.6,1.85,2.1,2.35,2.6]:cube('Brick courses',(6.1,1.443,z),(3.4,.012,.017),concrete)
for x in [5.4,6.8]:
    cube('Loading door',(x,1.414,1.15),(1.08,.07,1.85),steel)
    for z in [.45,.7,.95,1.2,1.45,1.7,1.95]:cube('Loading door panel',(x,1.368,z),(1.06,.021,.018),dark)
    for dx in [-.61,.61]:cyl('Loading bollard',(x+dx,1.05,.48),.06,.55,red)
text('Warehouse sign','MASON & CO.',(6.1,1.375,2.5),.21,trim)
# Canal / drainage and pedestrian bridge.
cube('Drainage bed',(8.65,0,.07),(1.5,15.6,.15),dark)
cube('Water',(8.65,0,.16),(1.26,15.5,.06),water,.03)
for x in [7.91,9.4]:cube('Drainage retaining wall',(x,0,.28),(.16,15.6,.38),concrete,.03)
for i in range(36):
    x=8.15+random.random()*.85;y=-7.5+random.random()*15
    cube('Water ripple',(x,y,.195),(.1+random.random()*.3,.013,.004),steel)
cube('Drainage bridge',(8.65,-3.25,.46),(1.7,1.25,.18),concrete,.03)
for y in [-3.82,-2.68]:
    cube('Bridge handrail',(8.65,y,1),(1.8,.04,.045),steel)
    for x in [7.86,8.65,9.44]:cyl('Rail post',(x,y,.73),.024,.56,steel)
# Parking bays, stops and cars.
for x in [-8.4,-6.6,4.7,6.5]:
    for xx in [x-.8,x+.8]:cube('Parking stripe',(xx,-1.8,.16),(.035,2.5,.013),white)
    cube('Wheel stop',(x,-.7,.25),(1.0,.17,.18),concrete,.025)

def car(x,y,color,angle=0):
    before=set(bpy.data.objects)
    paint=mat('Vehicle '+str(x)+str(y),color,.3,.35)
    cube('Vehicle body',(x,y,.48),(.85,1.7,.37),paint,.14)
    cube('Vehicle cabin',(x,y-.06,.78),(.72,.95,.38),glass,.13)
    cube('Car roof',(x,y-.05,.985),(.62,.65,.045),paint,.035)
    for dx in [-.44,.44]:
        for dy in [-.53,.53]:
            o=cyl('Tire',(x+dx,y+dy,.35),.19,.11,dark,16);o.rotation_euler.y=math.pi/2
            o=cyl('Wheel hub',(x+dx*1.03,y+dy,.35),.11,.115,steel,12);o.rotation_euler.y=math.pi/2
    for dx in [-.29,.29]:cube('Headlight',(x+dx,y-.856,.5),(.18,.02,.09),warm,.025)
    for o in set(bpy.data.objects)-before:
        if angle:
            p=o.location.copy();dx=p.x-x;dy=p.y-y;o.location.x=x+dx*math.cos(angle)-dy*math.sin(angle);o.location.y=y+dx*math.sin(angle)+dy*math.cos(angle);o.rotation_euler.z+=angle
car(-8.4,-1.9,(.43,.46,.44));car(-6.6,-1.9,(.15,.21,.19));car(4.7,-1.9,(.51,.48,.41));car(6.4,-6.7,(.27,.33,.36),math.pi/2)
# Organic, smooth clustered trees and shrubs (shared materials, joined at export).
def tree(x,y,s=1):
    cube('Tree planter',(x,y,.3),(.85*s,.85*s,.38),concrete,.045)
    cyl('Tree trunk',(x,y,1*s),.065*s,1.5*s,bark)
    for i in range(58):
        a=random.random()*math.tau; radius=random.random()**.5*.56*s
        dz=random.uniform(-.48,.48)*s
        radius *= max(.25, 1-abs(dz/s)*.9)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=(.12+random.random()*.11)*s,location=(x+math.cos(a)*radius,y+math.sin(a)*radius,2.05*s+dz))
        o=bpy.context.object;o.name='Leaf cluster';o.scale=(1,1,.85+random.random()*.6);o.rotation_euler=(random.random(),random.random(),random.random());o.data.materials.append(leaves[i%4])
        for p in o.data.polygons:p.use_smooth=True
for x,y,s in [(-8.7,3,1.1),(-8.4,5.7,1.15),(-6.1,-3,1),(-4.5,-3.1,.85),(2.85,-3.1,.85),(4.2,6.7,1),(7,6.8,.95),(-3,6.6,1.15),(.2,6.8,1)]:tree(x,y,s)
for x in [-5.9,3.9]:
    for y in [-.7,.1,.9,1.7,2.5,3.3,4.1]:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=.34,location=(x,y,.83));o=bpy.context.object;o.name='Low hedge';o.scale=(.7,1.3,.65);o.data.materials.append(leaves[0])
        for p in o.data.polygons:p.use_smooth=True
# Street furniture, hydrant and lamps.
cyl('Hydrant body',(1.65,-3.27,.51),.105,.5,red);cyl('Hydrant cap',(1.65,-3.27,.8),.15,.09,red)
o=cyl('Hydrant arms',(1.65,-3.27,.61),.065,.4,red);o.rotation_euler.y=math.pi/2
for x,y in [(-8.8,-3.3),(5.6,-3.25),(-7.1,6.5)]:
    cyl('Lamp pole',(x,y,1.62),.035,2.9,dark)
    cube('Lamp arm',(x+.23,y,3.05),(.52,.07,.07),dark,.02)
    cube('Lamp head',(x+.45,y,3.01),(.33,.18,.055),warm,.02)
for x in [-2.8,1]:
    cube('Bench seat',(x,-2.97,.62),(1,.32,.08),bark,.02)
    for dx in [-.38,.38]:cube('Bench legs',(x+dx,-2.97,.44),(.055,.27,.34),dark)
# 360-degree site detail: equipment enclosure, grates, rear clerestory windows.
for x in [-4,-2,0,2]:
    cube('SHELL rear clerestory',(x,4.375,2.6),(1.45,.025,.5),glass,.015)
for x in [-7.2,-6.4]:
    cube('Utility enclosure',(x,4.9,.72),(.65,1.1,1.1),steel,.04)
    for z in [.35,.5,.65,.8,.95,1.1]:cube('Utility louvers',(x,4.335,z),(.51,.025,.026),dark)
for x,y in [(7.55,-.6),(7.55,4.4),(-7,-3.35)]:
    cube('Storm drain',(x,y,.23),(.45,.65,.035),dark,.025)
    for dy in [-.24,-.12,0,.12,.24]:cube('Drain grate',(x,y+dy,.255),(.4,.025,.025),steel)
for x in [4.7,5.1,5.5]:
    cube('Loading pallet',(x,6.9,.35),(.34,.7,.2),bark,.015)
    cube('Warehouse inventory',(x,6.9,.64),(.28,.62,.38),concrete,.015)
# Site identity inset in the sectional front face.

text('Site label','N O R T H L I N E   /   0 1',(0,-8.011,-.42),.2,steel)
# Apply transforms and merge by material, cutting hundreds of objects to ~25 draw calls.
bpy.ops.object.select_all(action='DESELECT')
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
roof_names={'Roof membrane','Roof seam','Roof parapet','HVAC base','HVAC casing','Roof fan','Fan blade','Louver','Roof duct','Duct seam','Vent stack','Vent cap','Roof access hatch','Roof hatch lid','Roof maintenance patch'}
shell_names={'Front glazing','Side glazing','Window mullion','Side mullion','Front floor band','Side floor band','Facade pier','Entrance portal','Entry glass','Door stile','Door handle','Floating canopy','Canopy underlight','Tenant sign','Gutter','Downspout','Service ladder rung','Service ladder rail'}
by_material={}
for o in meshes:
    original=o.name.split('.')[0]
    part='roof' if original in roof_names else 'shell' if original in shell_names or original.startswith('SHELL') else 'frame' if original.startswith('FRAME') else 'interior' if original.startswith('Interior') else 'site'
    by_material.setdefault(part+'__'+o.data.materials[0].name,[]).append(o)
for name,objects in by_material.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();bpy.context.object.name=name
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'northline.glb'),export_format='GLB',export_yup=True,export_cameras=False,export_lights=False,export_extras=False)
# Matching high-quality fallback: transparent, orthographic architectural render.
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.world.color=(.2,.2,.2)
world=scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.24,.29,.28,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45
for name,loc,energy,size,color in [('Key',(-7,-9,18),2200,10,(1,.91,.77)),('Rim',(8,6,13),1900,8,(.72,.85,.85)),('Fill',(-10,4,8),1100,10,(.82,.87,1))]:
    bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=energy;o.data.shape='DISK';o.data.size=size;o.data.color=color;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(23,-29,23));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,.8))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=27;scene.camera=camera
scene.render.resolution_x=1400;scene.render.resolution_y=1080;scene.render.resolution_percentage=100;scene.render.film_transparent=True
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='WEBP' if False else 'PNG';scene.render.filepath=os.path.join(OUT,'northline-poster.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE,'northline.blend'))
bpy.ops.render.render(write_still=True)
print('ASTRA_MODEL_COMPLETE')

