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

// Гуго Ван Дер Верт: three charges redirected across his tabletop map.
// Measured on the 496 x 700 scan; all positions use top-left coordinates.
float ellipse(vec2 p, vec2 c, vec2 r) {
    return 1.0 - smoothstep(0.65, 1.0, length((p - c) / r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b - a;
    return length(p - a - ab * clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0));
}
float wire(vec2 p, vec2 a, vec2 b, float aa) {
    float d = segment(p, a, b);
    return (1.0 - smoothstep(0.0007, 0.0017 + aa, d))
         + exp(-d / 0.006) * 0.18;
}

void main() {
    vec2 p = vec2(v_uv.x, 1.0 - v_uv.y);
    vec4 scan = texture2D(u_card, v_uv);
    float aa = max(1.0 / u_resolution.x, 1.0 / u_resolution.y);
    float t = max(u_time, 0.0);
    float seed = fract(u_seed * 0.137) * 6.2831853;

    // Full exclusion below the first tabletop ornaments and above the subtitle.
    float art = smoothstep(0.137, 0.151, p.y)
              * (1.0 - smoothstep(0.531, 0.540, p.y));
    art *= smoothstep(0.019, 0.041, p.x)
         * (1.0 - smoothstep(0.957, 0.979, p.x));
    // Shield icon and its complete rim are immutable, including antialias pixels.
    art *= smoothstep(0.061, 0.073, length((p - vec2(0.108, 0.180)) * vec2(1.0, 1.42)));
    vec3 color = scan.rgb;
    float phase = t * 0.48 + seed;
    float breath = 0.65 + 0.35 * sin(phase);

    // His green cuff stone is the source: light spills onto that wrist alone.
    vec2 gem = vec2(0.741, 0.485);
    float gemCore = ellipse(p, gem, vec2(0.014, 0.009));
    float cuff = ellipse(p, gem, vec2(0.061, 0.032));
    color += vec3(0.03, 0.27, 0.22) * cuff * breath;
    color += vec3(0.36, 0.83, 0.61) * gemCore * (0.35 + 0.35 * breath);

    // A fine zigzag follows the resting glove, then meets the straight transfer
    // line between his hands. The tabletop stays fixed and legible underneath.
    float feed = wire(p, gem, vec2(0.705, 0.504), aa);
    feed += wire(p, vec2(0.705, 0.504), vec2(0.661, 0.510), aa);
    feed += wire(p, vec2(0.661, 0.510), vec2(0.632, 0.530), aa);
    float rail = wire(p, vec2(0.281, 0.530), vec2(0.632, 0.530), aa);
    float paper = wire(p, vec2(0.281, 0.530), vec2(0.315, 0.502), aa);
    paper += wire(p, vec2(0.315, 0.502), vec2(0.304, 0.444), aa);
    paper += wire(p, vec2(0.304, 0.444), vec2(0.366, 0.466), aa);
    color += vec3(0.07, 0.46, 0.34) * feed * (0.22 + 0.22 * breath);
    color += vec3(0.17, 0.48, 0.41) * rail * 0.24;
    color += vec3(0.57, 0.29, 0.07) * paper * (0.15 + 0.15 * breath);

    // Exactly three discrete packets redistribute along one straight line.
    // Soft appearance/disappearance avoids flashes when the travel wraps.
    float packets = 0.0;
    float strikes = 0.0;
    for (int i = 0; i < 3; i++) {
        float q = fract(t * 0.15 + float(i) / 3.0 + seed * 0.07);
        float visibility = smoothstep(0.0, 0.10, q)
                         * (1.0 - smoothstep(0.90, 1.0, q));
        vec2 center = vec2(mix(0.632, 0.281, q), 0.530);
        float d = length((p - center) * vec2(1.0, 1.42));
        packets += visibility * ((1.0 - smoothstep(0.002, 0.004 + aa, d))
                                + 0.30 * exp(-d / 0.012));
        // The intermediary is struck as a packet crosses the map's center.
        float crossing = exp(-pow((q - 0.50) / 0.085, 2.0));
        float spark = wire(p, vec2(0.456, 0.530), vec2(0.449, 0.516), aa);
        spark += wire(p, vec2(0.449, 0.516), vec2(0.461, 0.510), aa);
        spark += wire(p, vec2(0.461, 0.510), vec2(0.456, 0.498), aa);
        strikes += spark * crossing;
    }
    color += vec3(0.40, 0.81, 0.65) * packets * 0.64;
    color += vec3(0.75, 0.42, 0.12) * strikes * 0.32;
    float arrival = ellipse(p, vec2(0.281, 0.522), vec2(0.041, 0.026));
    color += vec3(0.24, 0.13, 0.025) * arrival * (0.55 + 0.45 * sin(t * 2.827 + seed));

    // Gentle current runs up the gold embroidery, keeping face and dark velvet.
    float lapels = ellipse(p, vec2(0.547, 0.357), vec2(0.077, 0.071))
                 + ellipse(p, vec2(0.740, 0.369), vec2(0.097, 0.076));
    float gold = smoothstep(0.07, 0.24, scan.r - scan.b)
               * smoothstep(0.22, 0.50, scan.g);
    float glimmer = pow(0.5 + 0.5 * sin(p.y * 55.0 + p.x * 20.0 - t * 1.3 + seed), 6.0);
    color += vec3(0.19, 0.10, 0.025) * lapels * gold * glimmer;

    if (u_is_foil) {
        // Engraved metal follows the map fan and embroidered garment; the
        // iridescent coating preserves ink contrast rather than bleaching it.
        float fan = length((p - vec2(0.315, 0.510)) * vec2(1.0, 1.42));
        float foilPhase = fan * 3.8 + p.x * 0.7 - t * 0.075 + seed * 0.10;
        vec3 spectrum = 0.5 + 0.5 * cos(6.2831853 * (foilPhase + vec3(0.0, 0.33, 0.67)));
        vec3 overlay = mix(2.0 * color * spectrum,
                           1.0 - 2.0 * (1.0 - color) * (1.0 - spectrum),
                           step(vec3(0.5), color));
        float face = ellipse(p, vec2(0.643, 0.249), vec2(0.101, 0.105));
        color = mix(color, overlay, 0.29 * (1.0 - face * 0.86));
        float metalBand = pow(0.5 + 0.5 * sin(fan * 29.0 - t * 0.8 + seed), 14.0);
        float luminance = dot(scan.rgb, vec3(0.2126, 0.7152, 0.0722));
        float ink = smoothstep(0.12, 0.50, luminance);
        color += (1.0 - color) * (vec3(0.09, 0.12, 0.12) + spectrum * 0.12)
               * metalBand * ink * (1.0 - face * 0.88);
    }

    gl_FragColor = vec4(mix(scan.rgb, clamp(color, 0.0, 1.0), art), scan.a);
}
