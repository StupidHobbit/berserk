#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

// Лимастра: the stroking hand sends three protective ribbons into the great
// cat's mane. Deflected sparks return as paired rose-gold healing petals.
// Coordinates are measured from the top left of the 496 x 700 printed card.
float softOval(vec2 p, vec2 c, vec2 r) {
    return 1.0 - smoothstep(0.45, 1.0, length((p - c) / r));
}
float segmentDistance(vec2 p, vec2 a, vec2 b) {
    vec2 d = b - a;
    return length(p - a - d * clamp(dot(p - a, d) / dot(d, d), 0.0, 1.0));
}
float randomValue(float n) { return fract(sin(n * 73.17 + 29.43) * 14371.31); }
vec2 manePath(float s, float offset) {
    return vec2(0.466 + 0.465 * s, 0.328 + 0.133 * s * s + offset * sin(s * 3.141593));
}

void main() {
    vec2 p = vec2(v_uv.x, 1.0 - v_uv.y);
    vec4 scan = texture2D(u_card, v_uv);
    float aa = max(1.0 / u_resolution.x, 1.0 / u_resolution.y);
    float t = max(u_time, 0.0);
    float seed = fract(u_seed * 0.173);
    // Leave the subtitle, left shield, entire stat frame, and parchment exact.
    float art = smoothstep(0.138, 0.151, p.y)
              * (1.0 - smoothstep(0.536, 0.549, p.y))
              * smoothstep(0.008, 0.023, p.x)
              * (1.0 - smoothstep(0.979, 0.994, p.x));
    art *= smoothstep(1.0, 1.15, length((p - vec2(0.106, 0.180)) / vec2(0.062, 0.044)));
    vec3 color = scan.rgb;
    float womanFace = softOval(p, vec2(0.356, 0.242), vec2(0.071, 0.066));
    float catFace = softOval(p, vec2(0.527, 0.255), vec2(0.125, 0.076));
    float faceProtection = 1.0 - max(womanFace, catFace) * 0.95;

    // Three distinct ward strands curve out from the hand across the pink mane.
    // A packet travels outwards along each strand; the lower strands fan apart.
    float ribbons = 0.0;
    float packets = 0.0;
    float s = clamp((p.x - 0.466) / 0.465, 0.0, 1.0);
    float ends = smoothstep(0.0, 0.065, s) * (1.0 - smoothstep(0.92, 1.0, s));
    for (int i = 0; i < 3; i++) {
        float n = float(i);
        float offset = (n - 1.0) * 0.027;
        vec2 curve = manePath(s, offset);
        float distanceToCurve = abs(p.y - curve.y) / sqrt(1.0 + pow(0.57 * s + offset * 6.75 * cos(s * 3.141593), 2.0));
        float travel = fract(t * 0.28 + n * 0.3333 + seed);
        float head = exp(-pow((s - travel) / 0.080, 2.0));
        float tail = smoothstep(travel - 0.30, travel - 0.04, s)
                   * (1.0 - smoothstep(travel - 0.025, travel + 0.04, s));
        float line = 1.0 - smoothstep(0.0010, 0.0020 + aa * 0.75, distanceToCurve);
        ribbons += line * (0.07 + tail * 0.45 + head * 0.90) * ends;
        packets += exp(-distanceToCurve / 0.010) * head * ends;
    }
    color += vec3(0.69, 0.40, 0.10) * ribbons * faceProtection;
    color += vec3(0.14, 0.20, 0.045) * packets * faceProtection;

    // Wards visibly bloom over the cat's outer shoulder as a traveling arc.
    // The ellipse is only visible on the right flank, clear of both faces.
    vec2 ward = (p - vec2(0.690, 0.391)) / vec2(0.276, 0.137);
    float wardAngle = atan(ward.y, ward.x);
    float outerSide = smoothstep(0.680, 0.770, p.x)
                    * smoothstep(0.299, 0.326, p.y);
    for (int i = 0; i < 3; i++) {
        float n = float(i);
        float wave = fract(t * 0.23 + n / 3.0 + seed);
        float r = 0.66 + wave * 0.45;
        float d = abs(length(ward) - r) * 0.137;
        float envelope = sin(wave * 3.141593);
        float crescent = smoothstep(-0.9, -0.6, wardAngle)
                       * (1.0 - smoothstep(0.70, 1.05, wardAngle));
        float edge = 1.0 - smoothstep(0.0018, 0.0028 + aa, d);
        color += vec3(0.19, 0.49, 0.26) * edge * envelope * crescent * outerSide * 0.72;
    }

    // Paired petals carry the prevented wounds back to her soothing fingers.
    // Their elongated silhouettes and trailing stems remain visible in a list.
    for (int i = 0; i < 12; i++) {
        float n = float(i);
        float pair = floor(n * 0.5);
        float side = mod(n, 2.0) * 2.0 - 1.0;
        float progress = fract(t * (0.15 + randomValue(pair + 2.0) * 0.025) + pair / 6.0 + seed);
        float pathS = 1.0 - progress;
        vec2 center = manePath(pathS, 0.03 * side);
        center.y += sin(progress * 6.283185 + pair) * 0.013;
        center.x += side * 0.008;
        float angle = -0.5 + 0.5 * sin(t * 1.6 + n * 1.4);
        vec2 delta = p - center;
        delta.y *= 1.4113;
        vec2 leaf = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * delta;
        float size = 0.007 + 0.004 * randomValue(pair + 9.0);
        float d = length(leaf / vec2(size, size * 0.46));
        float petal = 1.0 - smoothstep(0.55, 1.0 + aa / size * 0.6, d);
        float envelope = smoothstep(0.0, 0.08, progress)
                       * (1.0 - smoothstep(0.88, 1.0, progress));
        vec3 petalColor = mix(vec3(0.96, 0.42, 0.43), vec3(0.93, 0.72, 0.20), mod(n, 2.0));
        color = mix(color, petalColor, petal * envelope * 0.85 * faceProtection);
        float trail = segmentDistance(p, center + vec2(0.009, 0.003), center + vec2(0.028, 0.009));
        color += petalColor * (1.0 - smoothstep(0.0005, 0.001 + aa * 0.60, trail))
               * envelope * 0.22 * faceProtection;
    }
    float handGlow = softOval(p, vec2(0.460, 0.322), vec2(0.041, 0.030));
    float heartbeat = pow(0.5 + 0.5 * sin(t * 3.1 + seed * 6.283185), 4.0);
    color += vec3(0.27, 0.17, 0.040) * handGlow * (0.30 + heartbeat * 0.70);

    if (u_is_foil) {
        // Rose silk and violet fur receive a saturated interference coating.
        // It is visible even with time frozen, while facial detail remains ink.
        float mane = softOval(p, vec2(0.746, 0.378), vec2(0.29, 0.17));
        float silk = softOval(p, vec2(0.386, 0.427), vec2(0.18, 0.11));
        float phase = p.x * 1.75 + p.y * 2.2 + sin(p.y * 20.0 + p.x * 9.0) * 0.12 - t * 0.10 + seed;
        vec3 spectrum = 0.5 + 0.5 * cos(6.283185 * (phase + vec3(0.0, 0.33, 0.67)));
        vec3 metal = mix(2.0 * color * spectrum,
                        1.0 - 2.0 * (1.0 - color) * (1.0 - spectrum), step(vec3(0.5), color));
        color = mix(color, metal, (0.22 + mane * 0.22 + silk * 0.12) * faceProtection);
        float band = pow(0.5 + 0.5 * sin(p.x * 23.0 + p.y * 29.0 - t * 1.25 + seed * 6.28), 12.0);
        float litInk = smoothstep(0.13, 0.57, dot(scan.rgb, vec3(0.2126, 0.7152, 0.0722)));
        color += (1.0 - color) * mix(vec3(0.50, 0.27, 0.10), spectrum, 0.55)
               * band * litInk * (mane + silk * 0.5) * 0.30 * faceProtection;
    }
    gl_FragColor = vec4(mix(scan.rgb, clamp(color, 0.0, 1.0), art), scan.a);
}
