"""
Generate detailed self-contained glTF 2.0 industrial device models.

Each model is built from many labelled parts using multiple PBR materials,
then emitted as one glTF with several primitives. Buffers are embedded as
base64 data URIs so the assets work on any static host (e.g. GitHub Pages)
with no external .bin / texture files.

Models:
  reactor.gltf - 反应釜: 底座/锚栓/釜体/封头/法兰/视镜/搅拌电机/控制箱/梯子/管线
  tank.gltf    - 储罐: 撬装底座/罐体/加强圈/顶盖/人孔/液位计/爬梯/出口法兰
  cabinet.gltf - 配电柜: 底座/柜体/双开门/把手/百叶窗/指示灯/顶部线槽/警示牌
  cooler.gltf  - 冷却塔: 基础/塔体/进风百叶/风扇罩/六叶风扇/电机/水管/支腿

Run: python scripts/gen_model.py
"""
import base64
import json
import math
import os
import struct

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'models')

# Multipliers over the per-instance status color: mostly light neutrals so
# the status tint stays legible, with subtle warm/cool accents for detail.
MATERIALS = [
    {"name": "steel",  "color": [0.94, 0.97, 1.00], "metal": 0.55, "rough": 0.42},
    {"name": "dark",   "color": [0.64, 0.71, 0.82], "metal": 0.40, "rough": 0.60},
    {"name": "trim",   "color": [1.00, 0.94, 0.80], "metal": 0.65, "rough": 0.35},
    {"name": "glass",  "color": [0.80, 0.94, 1.00], "metal": 0.10, "rough": 0.16},
    {"name": "accent", "color": [0.90, 0.86, 1.00], "metal": 0.35, "rough": 0.48},
]

MAT_STEEL, MAT_DARK, MAT_TRIM, MAT_GLASS, MAT_ACCENT = range(len(MATERIALS))

_buckets = []
_current = 0


def reset():
    global _buckets, _current
    _buckets = [{"pos": [], "norm": [], "idx": []} for _ in MATERIALS]
    _current = 0


def mat(index):
    global _current
    _current = index


def bucket():
    return _buckets[_current]


def add_quad(v0, v1, v2, v3, n):
    b = bucket()
    base = len(b["pos"])
    for v in (v0, v1, v2, v3):
        b["pos"].append(v)
        b["norm"].append(n)
    b["idx"].extend([base, base + 1, base + 2, base, base + 2, base + 3])


def add_box(cx, cy, cz, w, h, d, yaw=0.0):
    hw, hh, hd = w / 2, h / 2, d / 2
    c, s = math.cos(yaw), math.sin(yaw)
    ux, uz, vx, vz = c, s, -s, c

    def W(lx, ly, lz):
        return (cx + ux * lx + vx * lz, cy + ly, cz + uz * lx + vz * lz)

    def N(lx, ly, lz):
        return (ux * lx + vx * lz, ly, uz * lx + vz * lz)

    faces = [
        ((1, 0, 0), (0, 0, -1), (0, 1, 0), hd, hh),
        ((-1, 0, 0), (0, 0, 1), (0, 1, 0), hd, hh),
        ((0, 1, 0), (1, 0, 0), (0, 0, -1), hw, hd),
        ((0, -1, 0), (1, 0, 0), (0, 0, 1), hw, hd),
        ((0, 0, 1), (1, 0, 0), (0, 1, 0), hw, hh),
        ((0, 0, -1), (-1, 0, 0), (0, 1, 0), hw, hh),
    ]
    for n, u, v, a, bb in faces:
        def P(sa, sb, u=u, v=v):
            return W(u[0] * sa + v[0] * sb, u[1] * sa + v[1] * sb, u[2] * sa + v[2] * sb)
        add_quad(P(-a, -bb), P(a, -bb), P(a, bb), P(-a, bb), N(*n))


def add_cylinder(cx, cy, cz, r, h, segments=20, r_top=None):
    r_top = r if r_top is None else r_top
    dr = r_top - r
    slope = math.atan2(dr, h) if h else 0
    cs, sn = math.cos(slope), math.sin(slope)
    for i in range(segments):
        t0 = 2 * math.pi * i / segments
        t1 = 2 * math.pi * (i + 1) / segments
        b0 = (cx + r * math.cos(t0), cy - h / 2, cz + r * math.sin(t0))
        t0v = (cx + r_top * math.cos(t0), cy + h / 2, cz + r_top * math.sin(t0))
        b1 = (cx + r * math.cos(t1), cy - h / 2, cz + r * math.sin(t1))
        t1v = (cx + r_top * math.cos(t1), cy + h / 2, cz + r_top * math.sin(t1))
        n0 = (math.cos(t0) * cs, -sn, math.sin(t0) * cs)
        n1 = (math.cos(t1) * cs, -sn, math.sin(t1) * cs)
        b = bucket()
        base = len(b["pos"])
        for p, n in ((b0, n0), (t0v, n0), (b1, n1), (t1v, n1)):
            b["pos"].append(p)
            b["norm"].append(n)
        b["idx"].extend([base, base + 1, base + 3, base, base + 3, base + 2])
    for sign, ny in ((1, 1), (-1, -1)):
        y = cy + sign * h / 2
        rr = r_top if sign > 0 else r
        b = bucket()
        center = len(b["pos"])
        b["pos"].append((cx, y, cz))
        b["norm"].append((0, ny, 0))
        rim = len(b["pos"])
        for i in range(segments + 1):
            t = 2 * math.pi * i / segments
            b["pos"].append((cx + rr * math.cos(t), y, cz + rr * math.sin(t)))
            b["norm"].append((0, ny, 0))
        for i in range(segments):
            if ny > 0:
                b["idx"].extend([center, rim + i + 1, rim + i])
            else:
                b["idx"].extend([center, rim + i, rim + i + 1])


def add_ring(cx, cy, cz, major, minor, segments=24, tube=6):
    """Horizontal torus (e.g. flange, fan shroud, stiffening ring)."""
    for i in range(segments):
        t0 = 2 * math.pi * i / segments
        t1 = 2 * math.pi * (i + 1) / segments
        for j in range(tube):
            p0 = 2 * math.pi * j / tube
            p1 = 2 * math.pi * (j + 1) / tube
            def V(t, p):
                rr = major + minor * math.cos(p)
                n = (math.cos(p) * math.cos(t), math.sin(p), math.cos(p) * math.sin(t))
                return ((cx + rr * math.cos(t), cy + minor * math.sin(p), cz + rr * math.sin(t)), n)
            v00, n00 = V(t0, p0)
            v10, n10 = V(t1, p0)
            v01, n01 = V(t0, p1)
            v11, n11 = V(t1, p1)
            b = bucket()
            base = len(b["pos"])
            for v, n in ((v00, n00), (v10, n10), (v01, n01), (v11, n11)):
                b["pos"].append(v)
                b["norm"].append(n)
            b["idx"].extend([base, base + 1, base + 2, base + 1, base + 3, base + 2])


def add_dome(cx, cy, cz, r, segments=20, rings=5, up=True):
    """Hemispherical dome starting at cy (full radius) closing at cy +/- r."""
    direction = 1 if up else -1
    for j in range(rings):
        phi0 = j * (math.pi / 2) / rings
        phi1 = (j + 1) * (math.pi / 2) / rings
        r0, r1 = r * math.cos(phi0), r * math.cos(phi1)
        y0, y1 = cy + direction * r * math.sin(phi0), cy + direction * r * math.sin(phi1)
        for i in range(segments):
            t0 = 2 * math.pi * i / segments
            t1 = 2 * math.pi * (i + 1) / segments
            def V(t, phi, rad, y):
                n = (math.cos(phi) * math.cos(t), direction * math.sin(phi), math.cos(phi) * math.sin(t))
                return ((cx + rad * math.cos(t), y, cz + rad * math.sin(t)), n)
            v00, n00 = V(t0, phi0, r0, y0)
            v10, n10 = V(t1, phi0, r0, y0)
            v01, n01 = V(t0, phi1, r1, y1)
            v11, n11 = V(t1, phi1, r1, y1)
            b = bucket()
            base = len(b["pos"])
            for v, n in ((v00, n00), (v10, n10), (v01, n01), (v11, n11)):
                b["pos"].append(v)
                b["norm"].append(n)
            b["idx"].extend([base, base + 1, base + 2, base + 1, base + 3, base + 2])


def add_pipe_x(cx, cy, cz, length, r=0.06, segments=10):
    for i in range(segments):
        t0 = 2 * math.pi * i / segments
        t1 = 2 * math.pi * (i + 1) / segments
        y0, z0 = cy + r * math.cos(t0), cz + r * math.sin(t0)
        y1, z1 = cy + r * math.cos(t1), cz + r * math.sin(t1)
        n0 = (0, math.cos(t0), math.sin(t0))
        n1 = (0, math.cos(t1), math.sin(t1))
        add_quad(
            (cx - length / 2, y0, z0), (cx + length / 2, y0, z0),
            (cx + length / 2, y1, z1), (cx - length / 2, y1, z1), n0,
        )
        # averaged normal slightly smoother than a single-quad flat normal
        b = bucket()
        for k in range(base_offset(b, 4), len(b["norm"])):
            b["norm"][k] = ((b["norm"][k][0] + n1[0]) / 2,
                            (b["norm"][k][1] + n1[1]) / 2,
                            (b["norm"][k][2] + n1[2]) / 2)


def base_offset(b, count):
    return len(b["pos"]) - count


def add_ladder(cx, cy, cz, height, width=0.34, rungs=7):
    for sx in (-1, 1):
        add_cylinder(cx + sx * width / 2, cy + height / 2, cz, 0.025, height, 8)
    for j in range(rungs):
        y = cy + 0.12 + (height - 0.24) * j / max(1, rungs - 1)
        add_box(cx, y, cz, width, 0.035, 0.05)


def add_indicator(cx, cy, cz, color_mat):
    mat(color_mat)
    add_cylinder(cx, cy, cz, 0.045, 0.03, 12)


def build_reactor():
    mat(MAT_DARK)
    add_box(0, 0.08, 0, 1.45, 0.16, 1.45)
    for x in (-0.58, 0.58):
        for z in (-0.58, 0.58):
            add_cylinder(x, 0.19, z, 0.05, 0.10, 8)

    mat(MAT_STEEL)
    add_cylinder(0, 0.82, 0, 0.50, 1.22, 24)
    add_dome(0, 1.43, 0, 0.50, 24, 5, True)
    mat(MAT_DARK)
    add_dome(0, 0.21, 0, 0.50, 24, 4, False)
    mat(MAT_TRIM)
    add_ring(0, 1.42, 0, 0.50, 0.035, 24, 6)
    add_ring(0, 0.42, 0, 0.51, 0.030, 24, 6)
    add_ring(0, 1.08, 0, 0.51, 0.025, 24, 6)

    mat(MAT_DARK)
    add_cylinder(0, 1.92, 0, 0.20, 0.30, 16)
    mat(MAT_STEEL)
    add_cylinder(0, 2.12, 0, 0.13, 0.20, 12)
    mat(MAT_TRIM)
    add_cylinder(0, 2.24, 0, 0.07, 0.12, 10)

    mat(MAT_STEEL)
    add_pipe_x(0, 1.12, 0, 1.42, 0.06, 12)
    add_pipe_x(0, 0.52, 0.10, 1.38, 0.05, 12)
    mat(MAT_TRIM)
    for x in (-0.68, 0.68):
        add_cylinder(x, 1.12, 0, 0.10, 0.06, 12)
    mat(MAT_GLASS)
    add_box(0.30, 0.88, 0.43, 0.12, 0.32, 0.05)

    mat(MAT_DARK)
    add_box(0.66, 0.58, 0.02, 0.28, 0.62, 0.40)
    mat(MAT_STEEL)
    add_box(0.66, 0.58, 0.23, 0.25, 0.56, 0.03)
    add_indicator(0.58, 0.76, 0.255, 2)
    add_indicator(0.66, 0.76, 0.255, 3)
    add_indicator(0.74, 0.76, 0.255, 4)

    mat(MAT_DARK)
    add_ladder(-0.42, 0.18, 0.28, 1.16)


def build_tank():
    mat(MAT_DARK)
    add_box(0, 0.09, 0, 1.62, 0.18, 1.26)
    for x in (-0.68, 0.68):
        for z in (-0.48, 0.48):
            add_cylinder(x, 0.24, z, 0.055, 0.12, 8)

    mat(MAT_STEEL)
    add_cylinder(0, 1.00, 0, 0.60, 1.36, 24)
    add_dome(0, 1.68, 0, 0.60, 24, 5, True)
    mat(MAT_DARK)
    add_dome(0, 0.32, 0, 0.60, 24, 4, False)
    mat(MAT_TRIM)
    for y in (0.66, 1.06, 1.46):
        add_ring(0, y, 0, 0.61, 0.028, 24, 6)

    mat(MAT_DARK)
    add_cylinder(0, 1.86, 0, 0.18, 0.20, 16)
    mat(MAT_STEEL)
    add_cylinder(0, 1.98, 0, 0.26, 0.06, 18)
    mat(MAT_TRIM)
    add_cylinder(0.46, 1.86, 0, 0.07, 0.34, 10)

    mat(MAT_GLASS)
    add_box(0.56, 0.98, 0.28, 0.05, 0.90, 0.05)
    mat(MAT_DARK)
    add_box(0.56, 0.52, 0.28, 0.10, 0.06, 0.10)
    add_box(0.56, 1.44, 0.28, 0.10, 0.06, 0.10)

    mat(MAT_STEEL)
    add_pipe_x(0.72, 0.66, 0, 0.62, 0.07, 12)
    mat(MAT_TRIM)
    add_cylinder(0.98, 0.66, 0, 0.13, 0.08, 14)

    mat(MAT_DARK)
    add_ladder(-0.55, 0.26, 0.26, 1.42, 0.36, 8)

    mat(MAT_DARK)
    add_box(0.30, 0.62, 0.52, 0.34, 0.46, 0.10)
    mat(MAT_STEEL)
    add_box(0.30, 0.62, 0.58, 0.29, 0.40, 0.02)
    add_indicator(0.22, 0.74, 0.60, 2)
    add_indicator(0.30, 0.74, 0.60, 3)


def build_cabinet():
    mat(MAT_DARK)
    add_box(0, 0.07, 0, 1.26, 0.14, 0.96)
    mat(MAT_STEEL)
    add_box(0, 0.98, 0, 1.10, 1.62, 0.76)
    mat(MAT_DARK)
    add_box(0, 1.80, 0, 1.16, 0.10, 0.82)

    mat(MAT_STEEL)
    for x in (-0.27, 0.27):
        add_box(x, 0.98, 0.39, 0.51, 1.52, 0.04)
        mat(MAT_DARK)
        add_box(x, 0.98, 0.415, 0.44, 1.44, 0.012)
        mat(MAT_STEEL)
        add_box(x + 0.19, 0.98, 0.44, 0.045, 0.24, 0.035)
        mat(MAT_TRIM)
        add_cylinder(x + 0.19, 0.98, 0.465, 0.035, 0.025, 10)

    mat(MAT_DARK)
    for x in (-0.27, 0.27):
        for i in range(6):
            add_box(x, 0.44 + i * 0.055, 0.43, 0.34, 0.018, 0.025)
    mat(MAT_STEEL)
    for x in (-0.27, 0.27):
        for i in range(3):
            add_indicator(x - 0.10 + i * 0.10, 1.58, 0.43, [2, 3, 4][i])

    mat(MAT_TRIM)
    add_box(0, 1.30, 0.44, 0.24, 0.14, 0.012)
    mat(MAT_DARK)
    add_box(0, 1.91, 0, 1.02, 0.12, 0.34)
    mat(MAT_STEEL)
    for x in (-0.36, 0.36):
        add_cylinder(x, 2.02, 0, 0.055, 0.12, 10)

    mat(MAT_GLASS)
    add_box(0, 1.10, 0.43, 0.16, 0.22, 0.012)


def build_cooler():
    mat(MAT_DARK)
    add_box(0, 0.09, 0, 1.56, 0.18, 1.56)
    for x in (-0.64, 0.64):
        for z in (-0.64, 0.64):
            add_cylinder(x, 0.24, z, 0.055, 0.14, 8)

    mat(MAT_STEEL)
    add_cylinder(0, 0.94, 0, 0.64, 1.34, 24, r_top=0.46)
    mat(MAT_DARK)
    for y in (0.46, 0.76, 1.06, 1.32):
        add_ring(0, y, 0, 0.64 - (y - 0.27) * 0.13, 0.022, 24, 5)
    mat(MAT_TRIM)
    add_ring(0, 1.60, 0, 0.52, 0.045, 26, 8)

    mat(MAT_DARK)
    add_cylinder(0, 1.66, 0, 0.17, 0.14, 14)
    mat(MAT_STEEL)
    add_cylinder(0, 1.80, 0, 0.10, 0.16, 12)
    mat(MAT_TRIM)
    for i in range(6):
        a = 2 * math.pi * i / 6
        cx, cz = 0.30 * math.cos(a), 0.30 * math.sin(a)
        add_box(cx, 1.62, cz, 0.48, 0.035, 0.13, yaw=-a)

    mat(MAT_DARK)
    add_box(0, 1.98, 0, 0.30, 0.22, 0.30)
    mat(MAT_STEEL)
    add_cylinder(0, 2.12, 0, 0.06, 0.10, 10)

    mat(MAT_STEEL)
    add_pipe_x(0, 0.36, 0, 1.44, 0.08, 12)
    mat(MAT_TRIM)
    add_cylinder(0.70, 0.36, 0, 0.14, 0.09, 14)

    mat(MAT_DARK)
    add_ladder(-0.50, 0.24, 0.30, 1.20, 0.32, 6)


def pad4(b):
    while len(b) % 4:
        b += b'\x00'
    return b


def emit(name, builder):
    reset()
    builder()
    chunks = []
    views = []
    accessors = []
    primitives = []
    offset = 0
    for mi, b in enumerate(_buckets):
        if not b["pos"]:
            continue
        pos_bytes = pad4(b''.join(struct.pack('<f', c) for p in b["pos"] for c in p))
        norm_bytes = pad4(b''.join(struct.pack('<f', c) for n in b["norm"] for c in n))
        idx_bytes = pad4(b''.join(struct.pack('<H', i) for i in b["idx"]))
        chunks.extend([pos_bytes, norm_bytes, idx_bytes])
        views.extend([
            {"buffer": 0, "byteOffset": offset, "byteLength": len(pos_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": offset + len(pos_bytes), "byteLength": len(norm_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": offset + len(pos_bytes) + len(norm_bytes),
             "byteLength": len(idx_bytes), "target": 34963},
        ])
        pa = len(accessors)
        mins = [min(p[i] for p in b["pos"]) for i in range(3)]
        maxs = [max(p[i] for p in b["pos"]) for i in range(3)]
        accessors.extend([
            {"bufferView": pa, "componentType": 5126, "count": len(b["pos"]), "type": "VEC3", "min": mins, "max": maxs},
            {"bufferView": pa + 1, "componentType": 5126, "count": len(b["norm"]), "type": "VEC3"},
            {"bufferView": pa + 2, "componentType": 5123, "count": len(b["idx"]), "type": "SCALAR"},
        ])
        primitives.append({
            "attributes": {"POSITION": pa, "NORMAL": pa + 1},
            "indices": pa + 2,
            "material": mi,
        })
        offset += len(pos_bytes) + len(norm_bytes) + len(idx_bytes)

    binary = b''.join(chunks)
    gltf = {
        "asset": {"version": "2.0", "generator": "industrial-demo-gen_model.py (multi-part)"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": name}],
        "meshes": [{"name": name + "Mesh", "primitives": primitives}],
        "materials": [
            {"name": m["name"], "doubleSided": False, "pbrMetallicRoughness": {
                "baseColorFactor": m["color"] + [1.0],
                "metallicFactor": m["metal"],
                "roughnessFactor": m["rough"],
            }} for m in MATERIALS
        ],
        "buffers": [{"byteLength": len(binary),
                     "uri": "data:application/octet-stream;base64," + base64.b64encode(binary).decode('ascii')}],
        "bufferViews": views,
        "accessors": accessors,
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name + '.gltf')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(gltf, f, separators=(',', ':'))
    total_v = sum(len(b["pos"]) for b in _buckets)
    total_i = sum(len(b["idx"]) for b in _buckets)
    print(f'{name}.gltf: {len(primitives)} parts, {total_v} verts, {total_i} idx, {len(binary)} bytes')


if __name__ == '__main__':
    emit('reactor', build_reactor)
    emit('tank', build_tank)
    emit('cabinet', build_cabinet)
    emit('cooler', build_cooler)
    print('Done ->', OUT_DIR)
