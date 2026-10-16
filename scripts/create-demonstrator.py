"""Create the original heavy-lift demonstrator as standard OpenRocket XML."""
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def add(parent, tag, value=None, **attributes):
    element = ET.SubElement(parent, tag, {k: str(v) for k, v in attributes.items()})
    if value is not None:
        element.text = str(value)
    return element

def component(parent, tag, name, **values):
    node = add(parent, tag)
    add(node, 'name', name)
    for key, value in values.items():
        add(node, key, value)
    return node

def paint(node, color):
    add(add(node, 'appearance'), 'paint', red=color[0], green=color[1], blue=color[2], alpha=255)

def position(node, method, offset):
    add(node, 'axialoffset', offset, method=method)

def tube(parent, name, length, radius, color, thickness=0.0025):
    node = component(parent, 'bodytube', name, length=length, radius=radius, thickness=thickness)
    paint(node, color)
    add(node, 'material', 'Composite demonstrator shell', type='bulk', density=1200)
    return node

def ring(parent, name, z, radius, inner, length=0.005):
    node = component(parent, 'centeringring', name, length=length, outerradius=radius, innerradius=inner)
    position(node, 'top', z)
    paint(node, (121, 139, 153))
    return node

def tank(parent, name, top, length, radius):
    shell = component(parent, 'innertube', name, length=length, outerradius=radius, thickness=0.002)
    position(shell, 'top', top)
    paint(shell, (150, 174, 187))
    internals = add(shell, 'subcomponents')
    for label, location in [('Forward diaphragm', 0.008), ('Aft diaphragm', length - 0.013)]:
        plate = component(internals, 'bulkhead', f'{name} / {label}', length=0.005, outerradius=radius - 0.002)
        position(plate, 'top', location)
        paint(plate, (167, 180, 187))
    return shell

def engine(parent, name):
    inlet = component(parent, 'transition', f'{name} / chamber', length=0.035, foreradius=0.008, aftradius=0.007, thickness=0.0015, shape='conical')
    paint(inlet, (71, 82, 91))
    bell = component(parent, 'transition', f'{name} / nozzle', length=0.050, foreradius=0.007, aftradius=0.016, thickness=0.0015, shape='parabolic', shapeparameter=0.65, shapeclipped='false')
    paint(bell, (81, 88, 96))

def engine_bay(parent, name, length=0.08, radius=0.065):
    bay = tube(parent, name, length, radius, (56, 64, 72))
    children = add(bay, 'subcomponents')
    ring(children, 'Thrust structure', 0.018, radius - 0.003, 0.014, 0.008)
    cluster = component(children, 'podset', 'Outer engines', instancecount=8)
    add(cluster, 'radiusoffset', 0.042, method='free')
    add(cluster, 'angleoffset', 22.5, method='relative')
    position(cluster, 'top', 0.037)
    engine(add(cluster, 'subcomponents'), 'Engine')
    center = component(children, 'podset', 'Center engine', instancecount=1)
    add(center, 'radiusoffset', 0, method='coaxial')
    position(center, 'top', 0.037)
    engine(add(center, 'subcomponents'), 'Center engine')
    return bay

white = (225, 230, 233)
light = (201, 211, 219)
dark = (53, 64, 75)
root = ET.Element('openrocket', {'version': '1.10', 'creator': 'ORKAD demonstrator'})
rocket = component(root, 'rocket', 'TRIAD Heavy / H9', designer='ORKAD', comment='Original 1:40-scale heavy-lift visualization demonstrator. Inspired by three-core launch vehicles; not a flight-qualified design or an exact Falcon Heavy replica.')
sub = add(rocket, 'subcomponents')
main = component(sub, 'stage', '01 / Center core and upper stage')
parts = add(main, 'subcomponents')
nose = component(parts, 'nosecone', 'Payload fairing / ogive crown', length=0.230, thickness=0.0025, shape='ogive', shapeparameter=1, aftradius=0.100, aftshoulderradius=0.096, aftshoulderlength=0.035, aftshoulderthickness=0.0025, aftshouldercapped='false')
paint(nose, white)
fairing = tube(parts, 'Payload fairing / barrel', 0.230, 0.100, white)
fairing_internals = add(fairing, 'subcomponents')
ring(fairing_internals, 'Payload support ring', 0.175, 0.0975, 0.048)
payload = component(fairing_internals, 'innertube', 'Payload envelope', length=0.210, outerradius=0.043, thickness=0.003)
position(payload, 'top', -0.050)
paint(payload, (185, 164, 105))
adapter = component(parts, 'transition', 'Payload fairing / tapered base', length=0.135, foreradius=0.100, aftradius=0.065, thickness=0.0025, shape='parabolic', shapeparameter=0.55, shapeclipped='false')
paint(adapter, white)
tube(parts, 'Fairing separation band', 0.018, 0.065, dark)
upper = tube(parts, '02 / Upper stage tank', 0.290, 0.065, white)
upper_children = add(upper, 'subcomponents')
tank(upper_children, 'Upper oxidizer tank', 0.015, 0.145, 0.055)
tank(upper_children, 'Upper fuel tank', 0.175, 0.095, 0.055)
for z in [0.012, 0.163, 0.275]:
    ring(upper_children, 'Upper stage frame', z, 0.0625, 0.056)
tube(parts, 'Upper stage equipment ring', 0.035, 0.065, light)
interstage = tube(parts, '03 / Center interstage', 0.090, 0.065, dark)
inter_children = add(interstage, 'subcomponents')
upper_engine = component(inter_children, 'transition', 'Upper stage vacuum nozzle', length=0.070, foreradius=0.013, aftradius=0.040, thickness=0.002, shape='parabolic', shapeparameter=0.6, shapeclipped='false')
position(upper_engine, 'top', -0.005)
paint(upper_engine, (112, 121, 129))
main_body = tube(parts, '04 / Center core airframe', 0.790, 0.065, white)
main_children = add(main_body, 'subcomponents')
tank(main_children, 'Center oxidizer tank', 0.020, 0.430, 0.055)
tank(main_children, 'Center fuel tank', 0.490, 0.270, 0.055)
for i, z in enumerate([0.015, 0.225, 0.455, 0.480, 0.765]):
    ring(main_children, f'Center structural frame {i + 1}', z, 0.0625, 0.056)
engine_bay(parts, '05 / Center thrust section')

boosters = component(sub, 'parallelstage', '06 / Side boosters', instancecount=2)
position(boosters, 'bottom', 0)
add(boosters, 'radiusoffset', 0.144, method='free')
add(boosters, 'angleoffset', 0, method='relative')
booster_parts = add(boosters, 'subcomponents')
booster_nose = component(booster_parts, 'nosecone', 'Booster recovery fairing', length=0.230, thickness=0.0025, shape='ogive', shapeparameter=0.8, aftradius=0.065, aftshoulderradius=0.061, aftshoulderlength=0.030, aftshoulderthickness=0.0025, aftshouldercapped='false')
paint(booster_nose, white)
guidance = tube(booster_parts, 'Booster guidance section', 0.065, 0.065, dark)
guidance_children = add(guidance, 'subcomponents')
fin = component(guidance_children, 'trapezoidfinset', 'Recovery control surfaces', fincount=4, rotation=45, thickness=0.003, rootchord=0.050, tipchord=0.040, sweeplength=0.005, height=0.054, crosssection='square')
position(fin, 'top', 0.008)
paint(fin, (94, 107, 117))
booster = tube(booster_parts, 'Booster oxidizer airframe', 0.510, 0.065, white)
booster_children = add(booster, 'subcomponents')
tank(booster_children, 'Booster oxidizer tank', 0.018, 0.475, 0.055)
for i, z in enumerate([0.010, 0.245, 0.492]):
    ring(booster_children, f'Booster oxidizer frame {i + 1}', z, 0.0625, 0.056)
tube(booster_parts, 'Booster intertank band', 0.020, 0.065, light)
fuel = tube(booster_parts, 'Booster fuel airframe', 0.260, 0.065, white)
fuel_children = add(fuel, 'subcomponents')
tank(fuel_children, 'Booster fuel tank', 0.015, 0.230, 0.055)
for i, z in enumerate([0.010, 0.242]):
    ring(fuel_children, f'Booster fuel frame {i + 1}', z, 0.0625, 0.056)
legs = component(fuel_children, 'trapezoidfinset', 'Stowed landing panels', fincount=4, rotation=45, thickness=0.006, rootchord=0.235, tipchord=0.110, sweeplength=0.075, height=0.016, crosssection='square')
position(legs, 'bottom', -0.006)
paint(legs, (96, 107, 118))
engine_bay(booster_parts, 'Booster thrust section')

# OpenRocket attaches parallel stages to a body tube, not directly to Rocket.
sub.remove(boosters)
main_children.append(boosters)
for offset in boosters.findall('axialoffset'):
    offset.text = '0.080'

ET.indent(root, space='  ')
xml = b'<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding='utf-8') + b'\n'
(ROOT / 'public' / 'triad-heavy.xml').write_bytes(xml)
with zipfile.ZipFile(ROOT / 'public' / 'triad-heavy.ork', 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('rocket.ork', xml)
print('Created triad-heavy.ork')
