"""
Generate a self-contained glTF 2.0 industrial device model.
The single mesh merges a base platform, a cylindrical tank and a side control box.
All buffer data is embedded as a base64 data URI so the model loads from any static host.
Run: python scripts/gen_model.py
"""
import base64
import json
import math
import os

positions = []
normals = []
indices = []


def add_quad(v0, v1, v2, v3, n):
    """Add a quad with explicit outward normal. v0->v1->v2->v3 is CCW from outside."""
    base = len(positions)
    for v in (v0, v1, v2, v3):
        positions.append(v)
        normals.append(n)
    indices.extend([base, base + 1, base + 2, base, base + 2, base + 3])


def add_box(cx, cy, cz, w, h, d):
    """Axis-aligned box centered at (cx,cy,cz)."""
    hw, hh, hd = w / 2, h / 2, d / 2
    faces = [
        ((1, 0, 0), (0, 0, -1), (0, 1, 0), hd, hh),   # +X
        ((-1, 0, 0), (0, 0, 1), (0, 1, 0), hd, hh),   # -X
        ((0, 1, 0), (1, 0, 0), (0, 0, -1), hw, hd),   # +Y
        ((0, -1, 0), (1, 0, 0), (0, 0, 1), hw, hd),   # -Y
        ((0, 0, 1), (1, 0, 0), (0, 1, 0), hw, hh),    # +Z
        ((0, 0, -1), (-1, 0, 0), (0, 1, 0), hw, hh),  # -Z
    ]
    for n, u, v, a, b in faces:
        c = (cx, cy, cz)
        def P(sa, sb):
            return (
                c[0] + u[0] * sa + v[0] * sb,
                c[1] + u[1] * sa + v[1] * sb,
                c[2] + u[2] * sa + v[2] * sb,
            )
        add_quad(P(-a, -b), P(a, -b), P(a, b), P(-a, b), n)


def add_cylinder(cx, cy, cz, r, h, segments=16):
    """Cylinder with flat caps, centered at (cx,cy,cz)."""
    # Side wall
    for i in range(segments):
        t0 = 2 * math.pi * i / segments
        t1 = 2 * math.pi * (i + 1) / segments
        b0 = (cx + r * math.cos(t0), cy - h / 2, cz + r * math.sin(t0))
        t0v = (cx + r * math.cos(t0), cy + h / 2, cz + r * math.sin(t0))
        b1 = (cx + r * math.cos(t1), cy - h / 2, cz + r * math.sin(t1))
        t1v = (cx + r * math.cos(t1), cy + h / 2, cz + r * math.sin(t1))
        n0 = (math.cos(t0), 0, math.sin(t0))
        n1 = (math.cos(t1), 0, math.sin(t1))
        base = len(positions)
        for p, n in ((b0, n0), (t0v, n0), (b1, n1), (t1v, n1)):
            positions.append(p)
            normals.append(n)
        indices.extend([base, base + 1, base + 3, base, base + 3, base + 2])

    # Caps
    for sign, ny in ((1, 1), (-1, -1)):
        y = cy + sign * h / 2
        center_idx = len(positions)
        positions.append((cx, y, cz))
        normals.append((0, ny, 0))
        rim_start = len(positions)
        for i in range(segments + 1):
            t = 2 * math.pi * i / segments
            positions.append((cx + r * math.cos(t), y, cz + r * math.sin(t)))
            normals.append((0, ny, 0))
        for i in range(segments):
            if ny > 0:
                indices.extend([center_idx, rim_start + i + 1, rim_start + i])
            else:
                indices.extend([center_idx, rim_start + i, rim_start + i + 1])


# --- Build the device geometry ------------------------------------------------
add_box(0, 0.07, 0, 1.35, 0.14, 1.35)          # base platform
add_cylinder(0, 0.72, 0, 0.46, 1.10, 20)        # main tank
add_cylinder(0, 1.34, 0, 0.30, 0.16, 16)        # top vent
add_box(0.56, 0.50, 0, 0.26, 0.52, 0.34)        # control box on the side

# --- Pack binary buffer -------------------------------------------------------
def pack_floats(vals):
    import struct
    return b''.join(struct.pack('<f', x) for x in vals)


def pack_u16(vals):
    import struct
    return b''.join(struct.pack('<H', x) for x in vals)


pos_bytes = pack_floats([c for p in positions for c in p])
norm_bytes = pack_floats([c for n in normals for c in n])
idx_bytes = pack_u16(indices)

# Align each bufferView to 4 bytes
def pad4(b):
    while len(b) % 4:
        b += b'\x00'
    return b

pos_bytes = pad4(pos_bytes)
norm_bytes = pad4(norm_bytes)
idx_bytes = pad4(idx_bytes)
binary = pos_bytes + norm_bytes + idx_bytes

mins = [min(p[i] for p in positions) for i in range(3)]
maxs = [max(p[i] for p in positions) for i in range(3)]

gltf = {
    "asset": {"version": "2.0", "generator": "industrial-demo-gen_model.py"},
    "scene": 0,
    "scenes": [{"nodes": [0]}],
    "nodes": [{"mesh": 0, "name": "IndustrialDevice"}],
    "meshes": [{
        "name": "DeviceMesh",
        "primitives": [{
            "attributes": {"POSITION": 0, "NORMAL": 1},
            "indices": 2,
            "material": 0,
        }],
    }],
    "materials": [{
        "name": "DeviceMat",
        "pbrMetallicRoughness": {
            "baseColorFactor": [0.72, 0.78, 0.86, 1.0],
            "metallicFactor": 0.35,
            "roughnessFactor": 0.55,
        },
    }],
    "buffers": [{
        "byteLength": len(binary),
        "uri": "data:application/octet-stream;base64," + base64.b64encode(binary).decode('ascii'),
    }],
    "bufferViews": [
        {"buffer": 0, "byteOffset": 0, "byteLength": len(pos_bytes), "target": 34962},
        {"buffer": 0, "byteOffset": len(pos_bytes), "byteLength": len(norm_bytes), "target": 34962},
        {"buffer": 0, "byteOffset": len(pos_bytes) + len(norm_bytes), "byteLength": len(idx_bytes), "target": 34963},
    ],
    "accessors": [
        {"bufferView": 0, "componentType": 5126, "count": len(positions), "type": "VEC3", "min": mins, "max": maxs},
        {"bufferView": 1, "componentType": 5126, "count": len(normals), "type": "VEC3"},
        {"bufferView": 2, "componentType": 5123, "count": len(indices), "type": "SCALAR"},
    ],
}

out_dir = os.path.join(os.path.dirname(__file__), '..', 'public', 'models')
os.makedirs(out_dir, exist_ok=True)
out_path = os.path.join(out_dir, 'device.gltf')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(gltf, f, separators=(',', ':'))

print(f'Wrote {out_path}: {len(positions)} vertices, {len(indices)} indices, {len(binary)} bytes binary')
