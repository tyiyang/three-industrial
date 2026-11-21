"""
Generate four self-contained glTF 2.0 industrial device models.
Each model embeds its buffer as a base64 data URI, so no external .bin files
are needed when hosted on GitHub Pages (or any static host).

Models:
  reactor.gltf - 反应釜: base + vessel + dome + side pipes + control box
  tank.gltf    - 储罐: skid + wide vessel + top cap + ladder + gauge
  cabinet.gltf - 配电柜: plinth + tall cabinet + door panels + vents
  cooler.gltf  - 冷却塔: base + tapered body + fan housing + blades

Run: python scripts/gen_model.py
"""
import base64
import json
import math
import os
import struct

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'models')

_positions = []
_normals = []
_indices = []


def reset():
    global _positions, _normals, _indices
    _positions, _normals, _indices = [], [], []


def add_quad(v0, v1, v2, v3, n):
    base = len(_positions)
    for v in (v0, v1, v2, v3):
        _positions.append(v)
        _normals.append(n)
    _indices.extend([base, base + 1, base + 2, base, base + 2, base + 3])


def add_box(cx, cy, cz, w, h, d):
    hw, hh, hd = w / 2, h / 2, d / 2
    faces = [
        ((1, 0, 0), (0, 0, -1), (0, 1, 0), hd, hh),
        ((-1, 0, 0), (0, 0, 1), (0, 1, 0), hd, hh),
        ((0, 1, 0), (1, 0, 0), (0, 0, -1), hw, hd),
        ((0, -1, 0), (1, 0, 0), (0, 0, 1), hw, hd),
        ((0, 0, 1), (1, 0, 0), (0, 1, 0), hw, hh),
        ((0, 0, -1), (-1, 0, 0), (0, 1, 0), hw, hh),
    ]
    for n, u, v, a, b in faces:
        def P(sa, sb):
            return (cx + u[0] * sa + v[0] * sb,
                    cy + u[1] * sa + v[1] * sb,
                    cz + u[2] * sa + v[2] * sb)
        add_quad(P(-a, -b), P(a, -b), P(a, b), P(-a, b), n)


def add_cylinder(cx, cy, cz, r, h, segments=16, r_top=None):
    r_top = r if r_top is None else r_top
    for i in range(segments):
        t0 = 2 * math.pi * i / segments
        t1 = 2 * math.pi * (i + 1) / segments
        b0 = (cx + r * math.cos(t0), cy - h / 2, cz + r * math.sin(t0))
        t0v = (cx + r_top * math.cos(t0), cy + h / 2, cz + r_top * math.sin(t0))
        b1 = (cx + r * math.cos(t1), cy - h / 2, cz + r * math.sin(t1))
        t1v = (cx + r_top * math.cos(t1), cy + h / 2, cz + r_top * math.sin(t1))
        dr = r_top - r
        slope = math.atan2(dr, h) if h else 0
        n0 = (math.cos(t0) * math.cos(slope), -math.sin(slope), math.sin(t0) * math.cos(slope))
        n1 = (math.cos(t1) * math.cos(slope), -math.sin(slope), math.sin(t1) * math.cos(slope))
        base = len(_positions)
        for p, n in ((b0, n0), (t0v, n0), (b1, n1), (t1v, n1)):
            _positions.append(p)
            _normals.append(n)
        _indices.extend([base, base + 1, base + 3, base, base + 3, base + 2])
    for sign, ny in ((1, 1), (-1, -1)):
        y = cy + sign * h / 2
        rr = r_top if sign > 0 else r
        center_idx = len(_positions)
        _positions.append((cx, y, cz))
        _normals.append((0, ny, 0))
        rim_start = len(_positions)
        for i in range(segments + 1):
            t = 2 * math.pi * i / segments
            _positions.append((cx + rr * math.cos(t), y, cz + rr * math.sin(t)))
            _normals.append((0, ny, 0))
        for i in range(segments):
            if ny > 0:
                _indices.extend([center_idx, rim_start + i + 1, rim_start + i])
            else:
                _indices.extend([center_idx, rim_start + i, rim_start + i + 1])


def add_pipe_x(cx, cy, cz, length, r=0.06, segments=10):
    rot = []
    for i in range(segments):
        t0 = 2 * math.pi * i / segments
        t1 = 2 * math.pi * (i + 1) / segments
        y0, z0 = cy + r * math.cos(t0), cz + r * math.sin(t0)
        y1, z1 = cy + r * math.cos(t1), cz + r * math.sin(t1)
        base = len(_positions)
        for p, n in (((cx - length / 2, y0, z0), (0, math.cos(t0), math.sin(t0))),
                     ((cx + length / 2, y0, z0), (0, math.cos(t0), math.sin(t0))),
                     ((cx - length / 2, y1, z1), (0, math.cos(t1), math.sin(t1))),
                     ((cx + length / 2, y1, z1), (0, math.cos(t1), math.sin(t1)))):
            _positions.append(p)
            _normals.append(n)
        _indices.extend([base, base + 2, base + 3, base, base + 3, base + 1])
    rot = None


def build_reactor():
    add_box(0, 0.07, 0, 1.40, 0.14, 1.40)
    add_cylinder(0, 0.78, 0, 0.48, 1.18, 20)
    add_cylinder(0, 1.44, 0, 0.34, 0.18, 16)
    add_cylinder(0, 1.60, 0, 0.10, 0.16, 10)
    add_box(0.60, 0.55, 0, 0.26, 0.56, 0.36)
    add_pipe_x(0, 1.05, 0, 1.35, 0.055)
    add_pipe_x(0, 0.42, 0, 1.30, 0.045)


def build_tank():
    add_box(0, 0.08, 0, 1.55, 0.16, 1.20)
    add_cylinder(0, 0.88, 0, 0.58, 1.28, 20)
    add_cylinder(0, 1.56, 0, 0.58, 0.12, 20)
    add_cylinder(0.52, 1.78, 0, 0.08, 0.32, 10)
    for z in (-0.40, 0.40):
        add_box(-0.58, 0.85, z, 0.07, 1.42, 0.07)
    add_box(0.45, 0.62, 0.35, 0.30, 0.42, 0.12)


def build_cabinet():
    add_box(0, 0.06, 0, 1.20, 0.12, 0.90)
    add_box(0, 0.90, 0, 1.05, 1.55, 0.72)
    for x in (-0.26, 0.26):
        add_box(x, 0.90, 0.37, 0.48, 1.45, 0.03)
        add_box(x, 0.90, 0.39, 0.04, 0.22, 0.02)
    for i in range(4):
        add_box(0, 0.35 + i * 0.34, -0.37, 0.80, 0.06, 0.02)
    add_box(0, 1.75, 0, 0.50, 0.10, 0.30)


def build_cooler():
    add_box(0, 0.08, 0, 1.50, 0.16, 1.50)
    add_cylinder(0, 0.80, 0, 0.62, 1.30, 20, r_top=0.42)
    add_cylinder(0, 1.52, 0, 0.50, 0.16, 20)
    add_cylinder(0, 1.68, 0, 0.16, 0.18, 12)
    for i in range(4):
        a = 2 * math.pi * i / 4
        cx, cz = 0.32 * math.cos(a), 0.32 * math.sin(a)
        add_box(cx, 1.62, cz, 0.42, 0.03, 0.10)
    for x in (-0.55, 0.55):
        add_box(x, 0.75, 0, 0.06, 1.28, 0.06)


def pad4(b):
    while len(b) % 4:
        b += b'\x00'
    return b


def emit(name, builder):
    reset()
    builder()
    pos_bytes = pad4(b''.join(struct.pack('<f', c) for p in _positions for c in p))
    norm_bytes = pad4(b''.join(struct.pack('<f', c) for n in _normals for c in n))
    idx_bytes = pad4(b''.join(struct.pack('<H', i) for i in _indices))
    binary = pos_bytes + norm_bytes + idx_bytes
    mins = [min(p[i] for p in _positions) for i in range(3)]
    maxs = [max(p[i] for p in _positions) for i in range(3)]
    gltf = {
        "asset": {"version": "2.0", "generator": "industrial-demo-gen_model.py"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": name}],
        "meshes": [{"name": name + "Mesh", "primitives": [{
            "attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "material": 0}]}],
        "materials": [{"name": name + "Mat", "pbrMetallicRoughness": {
            "baseColorFactor": [0.74, 0.80, 0.88, 1.0],
            "metallicFactor": 0.35, "roughnessFactor": 0.55}}],
        "buffers": [{"byteLength": len(binary),
                     "uri": "data:application/octet-stream;base64," + base64.b64encode(binary).decode('ascii')}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(pos_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": len(pos_bytes), "byteLength": len(norm_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": len(pos_bytes) + len(norm_bytes), "byteLength": len(idx_bytes), "target": 34963},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(_positions), "type": "VEC3", "min": mins, "max": maxs},
            {"bufferView": 1, "componentType": 5126, "count": len(_normals), "type": "VEC3"},
            {"bufferView": 2, "componentType": 5123, "count": len(_indices), "type": "SCALAR"},
        ],
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name + '.gltf')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(gltf, f, separators=(',', ':'))
    print(f'{name}.gltf: {len(_positions)} verts, {len(_indices)} idx, {len(binary)} bytes')


if __name__ == '__main__':
    emit('reactor', build_reactor)
    emit('tank', build_tank)
    emit('cabinet', build_cabinet)
    emit('cooler', build_cooler)
    print('Done ->', OUT_DIR)
