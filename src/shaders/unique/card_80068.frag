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

// Паролет, 80/68. Two steam turbines drive the red dwarf airship;
// its charged boiler feeds a three-beat deployment beside the painted parachute.
// All landmarks are top-left coordinates of the original 496 x 700 scan.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0 - smoothstep(0.45, 1.0, length((p - c) / r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 v = b - a;
    return length(p - a - v * clamp(dot(p - a, v) / dot(v, v), 0.0, 1.0));
}
float rotor(vec2 p, vec2 hub, float t, float aa) {
    // Flatten each rotor into the perspective of the painted engine pod.
    vec2 q = (p - hub) * vec2(1.0, 1.8);
    float r = length(q);
    float angle = t * 8.0;
    vec2 blade = vec2(cos(angle), sin(angle)) * 0.030;
    vec2 crossBlade = vec2(-blade.y, blade.x);
    float d = min(segment(q, -blade, blade), segment(q, -crossBlade, crossBlade));
    float spokes = 1.0 - smoothstep(0.0008, 0.0024 + aa, d);
    float disk = 1.0 - smoothstep(0.025, 0.036 + aa, r);
    float rim = 1.0 - smoothstep(0.001, 0.0025 + aa, abs(r - 0.031));
    return disk * spokes * 0.26 + rim * 0.09;
}
void main() {
    vec2 p = vec2(v_uv.x, 1.0 - v_uv.y);
    vec4 scan = texture2D(u_card, v_uv);
    float aa = max(1.0 / max(u_resolution.x, 1.0),
                   1.0 / max(u_resolution.y, 1.0));
    float seed = fract(u_seed * 0.173) * 6.2831853;
    float t = max(u_time, 0.0);
    // Stop before the title/class strip and lower stat frames. The two left
    // printed icons and their small value badge have independent exclusion masks.
    float art = smoothstep(0.139, 0.154, p.y)
              * (1.0 - smoothstep(0.542, 0.557, p.y));
    art *= smoothstep(0.018, 0.038, p.x)
         * (1.0 - smoothstep(0.958, 0.980, p.x));
    art *= smoothstep(1.0, 1.15, length((p - vec2(0.108, 0.181)) / vec2(0.061, 0.041)));
    art *= smoothstep(1.0, 1.15, length((p - vec2(0.108, 0.261)) / vec2(0.060, 0.041)));
    art *= smoothstep(1.0, 1.16, length((p - vec2(0.151, 0.286)) / vec2(0.029, 0.023)));
    vec3 color = scan.rgb;
    float luminance = dot(scan.rgb, vec3(0.2126, 0.7152, 0.0722));
    float goldInk = smoothstep(0.015, 0.15, scan.r - scan.b)
                  * smoothstep(0.01, 0.12, scan.g - scan.b);
    float skyInk = smoothstep(0.0, 0.16, scan.b - scan.r);
    float boiler = oval(p, vec2(0.509, 0.307), vec2(0.211, 0.153));
    float redInk = smoothstep(0.04, 0.18, scan.r - max(scan.g, scan.b));
    float pressure = 0.5 + 0.5 * sin(t * 1.65 + seed);
    // Warm pressure under the riveted red skin, strongest at the copper pipes.
    color += vec3(0.065, 0.012, 0.002) * boiler * redInk * (0.30 + pressure * 0.70);
    float pipes = oval(p, vec2(0.421, 0.370), vec2(0.105, 0.076));
    float feed = 0.5 + 0.5 * sin(p.x * 49.0 - p.y * 30.0 - t * 3.0 + seed);
    color += vec3(0.21, 0.11, 0.025) * pipes * goldInk * (0.18 + feed * feed * 0.52);

    // Two staggered turbine exhausts. Puffs widen and cool as they trail
    // down-left, following the white painted steam beneath each engine.
    float steam = 0.0;
    for (int i = 0; i < 12; i++) {
        float k = float(i);
        float side = step(5.5, k);
        float n = k - side * 6.0;
        float age = fract(t * 0.27 + n / 6.0 + side * 0.083 + seed * 0.025);
        vec2 nozzle = mix(vec2(0.333, 0.470), vec2(0.666, 0.466), side);
        vec2 drift = mix(vec2(-0.113, 0.069), vec2(-0.088, 0.080), side);
        vec2 center = nozzle + drift * age;
        center.x += sin(age * 12.0 + t * 1.7 + k) * age * 0.008;
        center.y += sin(age * 9.0 - t + k * 1.9) * age * 0.004;
        vec2 size = vec2(0.010 + age * 0.032, 0.006 + age * 0.018);
        float puff = oval(p, center, size)
                   + oval(p, center + vec2(size.x * 0.55, -size.y * 0.25), size * 0.72) * 0.45;
        float fade = smoothstep(0.0, 0.10, age) * (1.0 - smoothstep(0.48, 1.0, age));
        steam += puff * fade * 0.19;
    }
    color = mix(color, vec3(0.82, 0.91, 0.88), clamp(steam * (0.40 + skyInk * 0.60), 0.0, 0.52));
    float rotors = rotor(p, vec2(0.344, 0.462), t + seed, aa)
                 + rotor(p, vec2(0.669, 0.463), -t * 1.12 + seed, aa);
    color += vec3(0.44, 0.53, 0.48) * rotors;

    // The actual ochre parachute on the right breathes in the slipstream.
    // Keep all scan geometry fixed: animate only its painted cloth lighting.
    float canopy = oval(p, vec2(0.846, 0.418), vec2(0.104, 0.040));
    float cloth = smoothstep(0.015, 0.12, scan.r - scan.b);
    float ribs = sin((p.x - 0.846) * 68.0 + p.y * 19.0 - t * 2.1 + seed);
    color *= 1.0 + canopy * cloth * ribs * 0.09;
    // Three successive deployment wakes, echoing the card's three-use ability.
    // These short curved air ribbons pass beside the parachutist, in open sky.
    float wakes = 0.0;
    for (int j = 0; j < 3; j++) {
        float age = fract(t * 0.105 + float(j) * 0.12 + seed * 0.014);
        float envelope = smoothstep(0.03, 0.13, age) * (1.0 - smoothstep(0.37, 0.53, age));
        float y = 0.378 + age * 0.30;
        float x = 0.937 - (y - 0.410) * 0.30 + sin(y * 28.0 - t) * 0.006;
        float d = segment(p, vec2(x, y), vec2(x - 0.005, y + 0.017));
        wakes += (1.0 - smoothstep(0.0007, 0.0018 + aa, d)) * envelope;
    }
    color += vec3(0.22, 0.31, 0.29) * wakes * skyInk * 0.48;

    if (u_is_foil) {
        // Brass engraving catches a moving metallic reflection; silver turbine
        // housings receive a cooler reflection. The substrate below adds a restrained overall finish.
        float bow = oval(p, vec2(0.666, 0.286), vec2(0.127, 0.105));
        float fittings = clamp((boiler + bow + pipes) * goldInk, 0.0, 1.0);
        float pods = oval(p, vec2(0.342, 0.470), vec2(0.075, 0.045))
                   + oval(p, vec2(0.666, 0.469), vec2(0.068, 0.045));
        pods *= smoothstep(0.19, 0.60, luminance);
        float phase = p.x * 1.8 + p.y * 1.2 - t * 0.15 + seed * 0.04;
        vec3 spectrum = 0.5 + 0.5 * cos(6.2831853 * (phase + vec3(0.0, 0.33, 0.67)));
        vec3 metal = mix(vec3(1.0, 0.68, 0.25), spectrum, 0.35);
        float band = pow(0.5 + 0.5 * sin(phase * 6.2831853), 14.0);
        float grooves = 0.80 + 0.20 * sin(p.x * 133.0 + p.y * 65.0);
        color += (1.0 - color) * metal * fittings * (0.09 + band * 0.48) * grooves;
        color += (1.0 - color) * mix(vec3(0.55, 0.79, 0.88), spectrum, 0.30)
               * pods * band * 0.36;
        // Low-strength foil substrate remains recognizable at compact size;
        // the card-specific metallic details above keep their stronger highlights.
        vec3 finishHue = 0.5 + 0.5*cos(6.2831853*(p.x*1.4+p.y*0.9-t*0.12+seed*0.07+vec3(0.0,0.33,0.67)));
        vec3 finishOverlay = mix(2.0*color*finishHue,
            1.0-2.0*(1.0-color)*(1.0-finishHue),step(vec3(0.5),color));
        color = mix(color,finishOverlay,0.25);

    }
    gl_FragColor = vec4(mix(scan.rgb, clamp(color, 0.0, 1.0), art), scan.a);
}
