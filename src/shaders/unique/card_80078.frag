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

// Алирра: her pendant feeds a small artifact that unfolds into a living
// butterfly above her open palm, then condenses again. Top-left scan space.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0 - smoothstep(0.60, 1.0, length((p - c) / r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 d = b - a;
    return length(p - a - d * clamp(dot(p - a, d) / dot(d, d), 0.0, 1.0));
}
float wire(vec2 p, vec2 a, vec2 b, float aa) {
    float d = segment(p, a, b);
    return (1.0 - smoothstep(0.0008, 0.0020 + aa, d))
         + 0.23 * exp(-d / 0.007);
}
float butterfly(vec2 p, vec2 c, float scale, float opening, float aa) {
    vec2 q = (p - c) * vec2(1.0, 1.4113);
    q.x = abs(q.x);
    float w = scale * opening;
    float upper = length((q - vec2(w * 0.56, -scale * 0.25))
                        / vec2(w * 0.55, scale * 0.63));
    float lower = length((q - vec2(w * 0.40, scale * 0.41))
                        / vec2(w * 0.40, scale * 0.39));
    return 1.0 - smoothstep(0.84, 1.0 + aa / scale, min(upper, lower));
}

void main() {
    vec2 p = vec2(v_uv.x, 1.0 - v_uv.y);
    vec4 scan = texture2D(u_card, v_uv);
    float aa = max(1.0 / max(u_resolution.x, 1.0),
                   1.0 / max(u_resolution.y, 1.0));
    float seed = fract(u_seed * 0.173) * 6.2831853;
    float t = max(u_time, 0.0);
    // Below the class line, above the roots/stat frames. Preserve shield rim.
    float art = smoothstep(0.140, 0.155, p.y)
              * (1.0 - smoothstep(0.543, 0.558, p.y));
    art *= smoothstep(0.026, 0.046, p.x)
         * (1.0 - smoothstep(0.950, 0.975, p.x));
    art *= smoothstep(0.063, 0.079,
                     length((p - vec2(0.107, 0.180)) * vec2(1.0, 1.4113)));
    vec3 color = scan.rgb;
    float goldInk = smoothstep(0.06, 0.30, scan.g - scan.b)
                 * smoothstep(0.25, 0.70, scan.r);
    float alive = smoothstep(-0.60, 0.60, sin(t * 0.95 + seed));
    float breath = 0.5 + 0.5 * sin(t * 2.1 + seed);

    // The actual rectangular amulet and painted palm spiral are the sources.
    vec2 pendant = vec2(0.502, 0.389);
    vec2 palm = vec2(0.696, 0.458);
    float pendantMask = oval(p, pendant, vec2(0.029, 0.031));
    float palmMask = oval(p, palm, vec2(0.083, 0.078));
    color += vec3(0.24, 0.30, 0.045) * pendantMask * (0.35 + breath * 0.55);
    color += vec3(0.09, 0.17, 0.025) * palmMask * (0.28 + alive * 0.45);

    // Existing butterflies catch successive pulses, making the living side
    // of the transformation legible without moving the priestess or her face.
    float wings = 0.0;
    for (int i = 0; i < 4; i++) {
        float k = float(i);
        vec2 c = vec2(0.252, 0.401);
        vec2 r = vec2(0.089, 0.054);
        if (i == 1) { c = vec2(0.700, 0.245); r = vec2(0.060, 0.054); }
        if (i == 2) { c = vec2(0.792, 0.320); r = vec2(0.047, 0.031); }
        if (i == 3) { c = vec2(0.121, 0.321); r = vec2(0.061, 0.043); }
        float flutter = 0.5 + 0.5 * sin(t * 3.4 + k * 1.9 + seed);
        float wing = oval(p, c, r) * goldInk;
        wings += wing;
        color += vec3(0.21, 0.28, 0.065) * wing * (0.20 + flutter * 0.72);
    }

    // A gold diamond becomes four translucent wings in the painted magic.
    // This small emblem stays in the open space on the right of her fingers.
    vec2 emblem = vec2(0.737, 0.421);
    vec2 q = (p - emblem) * vec2(1.0, 1.4113);
    float diamond = abs(abs(q.x) + abs(q.y) - 0.028);
    float crystal = 1.0 - smoothstep(0.0011, 0.0024 + aa, diamond);
    float opening = 0.35 + 0.65 * (0.5 + 0.5 * sin(t * 4.6 + seed));
    float life = butterfly(p, emblem, 0.035, opening, aa);
    float body = wire(p, emblem - vec2(0.0, 0.019),
                        emblem + vec2(0.0, 0.017), aa);
    float form = mix(crystal, life * 0.68 + body * 0.40, alive);
    color = mix(color, vec3(0.36, 0.48, 0.065), clamp(form * 0.37, 0.0, 0.46));
    color += vec3(0.28, 0.37, 0.10) * form * (0.25 + 0.22 * breath);

    // A brief forked discharge runs through the painted right-side magic
    // toward the upper butterfly, never through skin or the lettering.
    float pulse = pow(0.5 + 0.5 * sin(t * 1.65 + seed), 9.0);
    vec2 a = vec2(0.766, 0.461);
    vec2 b = vec2(0.812, 0.415);
    vec2 c = vec2(0.785, 0.398);
    vec2 d = vec2(0.835, 0.355);
    float bolt = wire(p, a, b, aa) + wire(p, b, c, aa)
               + wire(p, c, d, aa) + wire(p, d, vec2(0.792, 0.327), aa);
    float fork = wire(p, b, vec2(0.854, 0.401), aa)
               + wire(p, vec2(0.854, 0.401), vec2(0.880, 0.366), aa);
    color += vec3(0.43, 0.56, 0.19) * (bolt + fork * 0.55) * (0.04 + pulse * 0.61);

    // Seeded motes rise from the palm to the butterfly already in the art.
    float motes = 0.0;
    for (int i = 0; i < 12; i++) {
        float k = float(i);
        float f = fract(k * 0.618034 + t * 0.12 + seed * 0.04);
        vec2 spot = mix(palm, vec2(0.703, 0.257), f);
        spot.x += sin(f * 8.0 + k * 2.4 + seed) * 0.042;
        float dist = length((p - spot) * vec2(1.0, 1.4113));
        float fade = sin(f * 3.14159265);
        motes += (1.0 - smoothstep(0.0008, 0.0022 + aa, dist)) * fade * 0.52;
    }
    color += vec3(0.42, 0.50, 0.14) * motes;

    if (u_is_foil) {
        float hair = oval(p, vec2(0.406, 0.237), vec2(0.214, 0.100));
        float finish = clamp((hair * 0.75 + wings + pendantMask + palmMask * 0.55)
                           * goldInk + form * 0.4, 0.0, 1.0);
        float phase = p.x * 1.8 - p.y * 1.1 + t * 0.13 + seed * 0.10;
        vec3 spectrum = 0.5 + 0.5 * cos(6.2831853 * (phase + vec3(0.0, 0.33, 0.67)));
        vec3 coated = mix(2.0 * color * spectrum,
                         1.0 - 2.0 * (1.0 - color) * (1.0 - spectrum),
                         step(vec3(0.5), color));
        color = mix(color, coated, finish * 0.52);
        float glint = pow(0.5 + 0.5 * sin(p.x * 19.0 + p.y * 13.0 - t * 1.8), 12.0);
        color += (1.0 - color) * (vec3(0.23) + spectrum * 0.43) * glint * finish;
        // Low-strength foil substrate remains recognizable at compact size;
        // the card-specific metallic details above keep their stronger highlights.
        vec3 finishHue = 0.5 + 0.5*cos(6.2831853*(p.x*1.4+p.y*0.9-t*0.12+seed*0.07+vec3(0.0,0.33,0.67)));
        vec3 finishOverlay = mix(2.0*color*finishHue,
            1.0-2.0*(1.0-color)*(1.0-finishHue),step(vec3(0.5),color));
        color = mix(color,finishOverlay,0.25);

    }
    gl_FragColor = vec4(mix(scan.rgb, clamp(color, 0.0, 1.0), art), scan.a);
}
