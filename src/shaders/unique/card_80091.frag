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

// Агронн: the two forest companions share one living leaf ward. The bow
// behind his right shoulder releases a brief shot into the open woodland.
// Landmarks are normalized top-left coordinates of the original scan.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0 - smoothstep(0.55, 1.0, length((p - c) / r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 v = b - a;
    return length(p - a - v * clamp(dot(p - a, v) / dot(v, v), 0.0, 1.0));
}
float thread(vec2 p, vec2 a, vec2 b, float aa) {
    return 1.0 - smoothstep(0.0007, 0.0018 + aa, segment(p, a, b));
}

void main() {
    vec2 p = vec2(v_uv.x, 1.0 - v_uv.y);
    vec4 scan = texture2D(u_card, v_uv);
    float aa = max(1.0 / max(u_resolution.x, 1.0),
                   1.0 / max(u_resolution.y, 1.0));
    float t = max(u_time, 0.0);
    float seed = fract(u_seed * 0.173) * 6.2831853;
    float art = smoothstep(0.140, 0.157, p.y)
              * (1.0 - smoothstep(0.542, 0.558, p.y))
              * smoothstep(0.024, 0.043, p.x)
              * (1.0 - smoothstep(0.954, 0.977, p.x));
    // Both printed defensive badges remain exact, including their rims.
    art *= smoothstep(1.0, 1.14, length((p - vec2(0.108, 0.181)) / vec2(0.062, 0.042)));
    art *= smoothstep(1.0, 1.14, length((p - vec2(0.108, 0.260)) / vec2(0.062, 0.043)));
    vec3 color = scan.rgb;
    float breath = 0.5 + 0.5 * sin(t * 1.65 + seed);
    float ward = 0.0;
    float leafLight = 0.0;

    // Identical pointed leaves flank the two actual women. Only the outer
    // edges and tiny branching veins glow: faces and bodies stay legible.
    for (int i = 0; i < 2; i++) {
        float side = float(i);
        vec2 center = mix(vec2(0.213, 0.426), vec2(0.739, 0.426), side);
        vec2 q = p - center;
        float height = 0.104;
        float z = clamp((q.y + height) / (2.0 * height), 0.0, 1.0);
        float width = 0.091 * sin(z * 3.14159265);
        float edge = abs(abs(q.x) - width);
        float cap = 1.0 - smoothstep(height - 0.007, height, abs(q.y));
        float rim = (1.0 - smoothstep(0.0007, 0.0020 + aa, edge)) * cap;
        float halo = exp(-edge * 170.0) * cap;
        float travelling = 0.5 + 0.5 * cos(z * 9.0 - t * 2.2 + seed);
        ward += rim * (0.20 + breath * 0.37 + travelling * 0.23);
        leafLight += halo * (0.10 + breath * 0.13);
        // Short veins stay at the lower sides, away from hands and faces.
        float signSide = mix(-1.0, 1.0, side);
        vec2 a = center + vec2(signSide * 0.071, 0.035);
        vec2 b = center + vec2(signSide * 0.043, 0.047);
        ward += thread(p, a, b, aa) * (0.12 + breath * 0.25);
        ward += thread(p, a + vec2(0.0, 0.022),
                          b + vec2(-signSide * 0.008, 0.023), aa) * (0.10 + breath * 0.22);
    }
    color += vec3(0.24, 0.39, 0.075) * ward;
    color += vec3(0.09, 0.16, 0.025) * leafLight;

    // The standing forest catches a synchronized breeze around the kin.
    float forest = oval(p, vec2(0.884, 0.393), vec2(0.102, 0.152))
                 + oval(p, vec2(0.071, 0.436), vec2(0.071, 0.105));
    float green = smoothstep(0.01, 0.14, scan.g - scan.r)
                * smoothstep(0.01, 0.13, scan.g - scan.b);
    color += vec3(0.025, 0.10, 0.025) * green * forest
           * (0.35 + 0.65 * sin(p.y * 58.0 + p.x * 18.0 - t * 2.0 + seed));

    // A physical arrow flies from the painted bow, across the empty upper
    // right background. Its shaft, barb, and two fletches move as one.
    float age = fract(t * 0.22 + seed * 0.045);
    float shot = smoothstep(0.03, 0.09, age) * (1.0 - smoothstep(0.36, 0.43, age));
    float travel = clamp((age - 0.03) / 0.40, 0.0, 1.0);
    vec2 tip = mix(vec2(0.709, 0.281), vec2(0.950, 0.213), travel);
    vec2 dir = normalize(vec2(0.241, -0.068));
    vec2 normal = vec2(-dir.y, dir.x);
    vec2 tail = tip - dir * 0.059;
    float arrow = thread(p, tail, tip, aa);
    arrow += thread(p, tip, tip - dir * 0.014 + normal * 0.006, aa);
    arrow += thread(p, tip, tip - dir * 0.014 - normal * 0.006, aa);
    arrow += thread(p, tail + dir * 0.014, tail + normal * 0.007, aa) * 0.7;
    arrow += thread(p, tail + dir * 0.014, tail - normal * 0.007, aa) * 0.7;
    float wake = exp(-segment(p, tail - dir * 0.054, tail) * 320.0);
    color += vec3(0.48, 0.51, 0.24) * arrow * shot * 0.75;
    color += vec3(0.12, 0.20, 0.06) * wake * shot;

    // A few golden leaf specks follow the edges of the paired ward.
    for (int j = 0; j < 10; j++) {
        float k = float(j);
        float side = step(4.5, k);
        float f = fract(k * 0.381966 + t * 0.10 + seed * 0.03);
        float cx = mix(0.213, 0.739, side);
        float signSide = mix(-1.0, 1.0, side);
        vec2 c = vec2(cx + signSide * 0.091 * sin(f * 3.14159265),
                      0.530 - 0.208 * f);
        float d = length((p - c) * vec2(1.0, 1.4113));
        float mote = 1.0 - smoothstep(0.0009, 0.0023 + aa, d);
        color += vec3(0.45, 0.48, 0.13) * mote * sin(f * 3.14159265) * 0.65;
    }

    if (u_is_foil) {
        // Cool metallic engraving follows blue-white horns and hair; bronze
        // reflections follow the spear and bow. These stronger highlights avoid skin.
        float coolInk = smoothstep(0.02, 0.17, scan.b - scan.r);
        float horns = oval(p, vec2(0.507, 0.180), vec2(0.272, 0.044));
        float hair = oval(p, vec2(0.502, 0.247), vec2(0.167, 0.105));
        float silver = clamp(horns + hair, 0.0, 1.0) * coolInk;
        float spear = oval(p, vec2(0.330, 0.300), vec2(0.040, 0.165));
        float bow = oval(p, vec2(0.686, 0.260), vec2(0.063, 0.110));
        float bronze = clamp(spear + bow, 0.0, 1.0)
                     * smoothstep(0.03, 0.19, scan.r - scan.b);
        float phase = p.x * 2.0 + p.y * 1.5 - t * 0.16 + seed * 0.05;
        vec3 spectrum = 0.5 + 0.5 * cos(6.2831853 * (phase + vec3(0.0, 0.33, 0.67)));
        float band = pow(0.5 + 0.5 * sin(phase * 6.2831853), 13.0);
        color = mix(color, color * (0.68 + spectrum * 0.70), silver * 0.55);
        color += (1.0 - color) * mix(vec3(0.65, 0.85, 0.98), spectrum, 0.50)
               * silver * (0.08 + band * 0.65);
        color += (1.0 - color) * mix(vec3(1.0, 0.65, 0.22), spectrum, 0.38)
               * bronze * (0.10 + band * 0.66);
        color += spectrum * ward * (0.12 + band * 0.30);
        // Low-strength foil substrate remains recognizable at compact size;
        // the card-specific metallic details above keep their stronger highlights.
        vec3 finishHue = 0.5 + 0.5*cos(6.2831853*(p.x*1.4+p.y*0.9-t*0.12+seed*0.07+vec3(0.0,0.33,0.67)));
        vec3 finishOverlay = mix(2.0*color*finishHue,
            1.0-2.0*(1.0-color)*(1.0-finishHue),step(vec3(0.5),color));
        color = mix(color,finishOverlay,0.25);

    }
    gl_FragColor = vec4(mix(scan.rgb, clamp(color, 0.0, 1.0), art), scan.a);
}
