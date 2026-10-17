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

// Халия: the staff's clock runs backwards; two electrical discharges
// follow the painted blue current between her raised fingers and the staff.
// All positions below are measured on the 496 x 700 scan, from top left.
float halo(vec2 p, vec2 c, vec2 r) {
    return 1.0 - smoothstep(0.55, 1.0, length((p - c) / r));
}
float lineDistance(vec2 p, vec2 a, vec2 b) {
    vec2 v = b - a;
    return length(p - a - v * clamp(dot(p - a, v) / dot(v, v), 0.0, 1.0));
}
float hash(float n) { return fract(sin(n * 127.1 + 17.7) * 43758.5453); }
vec2 curve(float s) {
    return mix(mix(vec2(0.945, 0.184), vec2(0.765, 0.299), s),
               mix(vec2(0.765, 0.299), vec2(0.570, 0.388), s), s);
}

void main() {
    vec2 p = vec2(v_uv.x, 1.0 - v_uv.y);
    vec4 scan = texture2D(u_card, v_uv);
    float aa = max(1.0 / u_resolution.x, 1.0 / u_resolution.y);
    float t = u_time;
    float seed = fract(u_seed * 0.173);

    // The parchment, swords, lower stat plaques and upper labels are untouched.
    float art = smoothstep(0.008, 0.022 + aa, p.x)
              * (1.0 - smoothstep(0.978 - aa, 0.992, p.x))
              * smoothstep(0.140, 0.154 + aa, p.y)
              * (1.0 - smoothstep(0.538 - aa, 0.553, p.y));
    float badgeDistance = length((p - vec2(0.108, 0.180)) / vec2(0.064, 0.048));
    art *= smoothstep(1.0, 1.12 + aa, badgeDistance);
    vec3 color = scan.rgb;

    // The source painting already has a blue river of time. Light runs back
    // up its contours without displacing any part of the printed illustration.
    float face = halo(p, vec2(0.216, 0.318), vec2(0.100, 0.078));
    float blueInk = smoothstep(0.018, 0.15, scan.b - scan.r)
                 * smoothstep(0.12, 0.48, scan.g);
    float upperRiver = halo(p, vec2(0.754, 0.249), vec2(0.280, 0.117));
    float lowerRiver = halo(p, vec2(0.320, 0.492), vec2(0.360, 0.064));
    float flow = 0.5 + 0.5 * sin(p.x * 40.0 + p.y * 24.0 + t * 2.8 + seed * 6.28);
    color += vec3(0.018, 0.16, 0.23) * blueInk * (upperRiver + lowerRiver)
           * (0.24 + 0.76 * flow) * (1.0 - face);

    // Concentric broken clock faces fit the large turquoise staff jewel.
    // Their negative angular velocity makes the time reversal legible.
    vec2 q = (p - vec2(0.664, 0.448)) * vec2(1.0, 1.41);
    float radius = length(q);
    float theta = atan(q.y, q.x);
    float rewindAngle = theta + t * 0.85 + seed * 6.2831853;
    float ring1 = 1.0 - smoothstep(0.0010, 0.0010 + aa * 1.4, abs(radius - 0.040));
    float ring2 = 1.0 - smoothstep(0.0007, 0.0007 + aa * 1.4, abs(radius - 0.059));
    float broken1 = smoothstep(-0.05, 0.35, sin(rewindAngle * 3.0));
    float broken2 = smoothstep(0.15, 0.55, sin(rewindAngle * 2.0 - 1.0));
    float ticks = pow(0.5 + 0.5 * cos(rewindAngle * 12.0), 18.0)
                * (1.0 - smoothstep(0.003, 0.005 + aa, abs(radius - 0.050)));
    float hand = 1.0 - smoothstep(0.0008, 0.0008 + aa, lineDistance(q, vec2(0.0),
                 vec2(cos(-t * 0.85 - seed * 6.2831853), sin(-t * 0.85 - seed * 6.2831853)) * 0.033));
    float clockLight = ring1 * broken1 * 0.65 + ring2 * broken2 * 0.32 + ticks * 0.48 + hand * 0.55;
    color += vec3(0.26, 0.72, 0.73) * clockLight;
    color += vec3(0.018, 0.11, 0.13) * exp(-radius * radius / 0.0015)
           * (0.60 + 0.40 * sin(t * 1.4));

    // Two flashes per slow concentration cycle, routed along the existing
    // lightning behind the head and into the staff, never across her face.
    float cycle = mod(t + seed * 6.0, 6.0);
    float discharge = exp(-pow((cycle - 1.3) / 0.17, 2.0))
                    + exp(-pow((cycle - 2.1) / 0.20, 2.0));
    vec2 a = vec2(0.461, 0.249);
    vec2 b = vec2(0.572, 0.260);
    vec2 c = vec2(0.635, 0.228);
    vec2 d = vec2(0.688, 0.239);
    vec2 e = vec2(0.749, 0.194);
    vec2 f = vec2(0.804, 0.202);
    vec2 g = vec2(0.894, 0.159);
    float bolt = min(min(lineDistance(p, a, b), lineDistance(p, b, c)),
                    min(lineDistance(p, c, d), lineDistance(p, d, e)));
    bolt = min(bolt, min(lineDistance(p, e, f), lineDistance(p, f, g)));
    float branch = min(lineDistance(p, d, vec2(0.732, 0.269)),
                       lineDistance(p, vec2(0.732, 0.269), vec2(0.823, 0.250)));
    float boltCore = 1.0 - smoothstep(0.0006, 0.0006 + aa, bolt);
    float boltHalo = exp(-bolt / 0.009);
    color += (vec3(0.61, 0.81, 0.95) * boltCore + vec3(0.06, 0.26, 0.40) * boltHalo)
           * (0.09 + 0.78 * discharge);
    color += vec3(0.15, 0.50, 0.72) * exp(-branch / (0.001 + aa)) * discharge * 0.42;

    // Concentration returns luminous fragments to her open hand. Particles
    // follow the staff's diagonal, with a trailing point showing their motion.
    float sparks = 0.0;
    for (int i = 0; i < 20; i++) {
        float n = float(i);
        float s = fract(hash(n + 3.1) + t * (0.10 + hash(n + 4.2) * 0.045));
        vec2 position = curve(s);
        float spread = sin(s * 3.14159265) * 0.030;
        position += vec2(sin(n * 2.4 + t * 1.1), cos(n * 1.8 + t * 1.1)) * spread;
        vec2 tail = normalize(vec2(0.38, -0.22)) * (0.004 + hash(n) * 0.008);
        float dist = lineDistance(p, position, position + tail);
        float size = 0.0008 + hash(n + 9.0) * 0.0010;
        float envelope = smoothstep(0.0, 0.12, s) * (1.0 - smoothstep(0.88, 1.0, s));
        sparks += (1.0 - smoothstep(size, size + aa, dist)) * envelope;
    }
    color += vec3(0.29, 0.69, 0.83) * sparks * 0.65;
    float palm = halo(p, vec2(0.574, 0.391), vec2(0.047, 0.033));
    color += vec3(0.11, 0.30, 0.35) * palm * (0.32 + 0.15 * sin(t * 1.8) + discharge * 0.3);

    if (u_is_foil) {
        // Metallic interference rotates with the clock and travels through the
        // ornate staff; overlay blending keeps the original ink's dark values.
        float phase = p.x * 1.8 + p.y * 1.1 + sin(theta - t * 0.33) * 0.18 + t * 0.11 + seed;
        vec3 pearl = 0.5 + 0.5 * cos(6.2831853 * (phase + vec3(0.0, 0.33, 0.67)));
        vec3 coated = mix(2.0 * color * pearl,
                         1.0 - 2.0 * (1.0 - color) * (1.0 - pearl), step(vec3(0.5), color));
        float staff = halo(p, vec2(0.808, 0.332), vec2(0.21, 0.23));
        color = mix(color, coated, (0.20 + staff * 0.22) * (1.0 - face * 0.8));
        float metallic = pow(0.5 + 0.5 * sin(p.x * 17.0 + p.y * 13.0 + t * 1.0), 18.0);
        float ink = smoothstep(0.16, 0.60, dot(scan.rgb, vec3(0.2126, 0.7152, 0.0722)));
        color += (1.0 - color) * mix(vec3(0.65, 0.86, 0.88), pearl, 0.4)
               * metallic * ink * staff * 0.22;
    }

    gl_FragColor = vec4(mix(scan.rgb, clamp(color, 0.0, 1.0), art), scan.a);
}
