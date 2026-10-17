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

// Хигарт Несокрушимый, 60/218: a steadfast warrior in a mountain blizzard.
// Coordinates refer to the actual 496×700 scan, measured from its top left.
float hash(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
float ellipse(vec2 p, vec2 center, vec2 radius) {
    float d = length((p - center) / radius);
    return 1.0 - smoothstep(0.75, 1.0, d);
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 v = b - a;
    return length(p - a - v * clamp(dot(p - a, v) / dot(v, v), 0.0, 1.0));
}
void main() {
    vec2 p = vec2(v_uv.x, 1.0 - v_uv.y);
    vec4 scan = texture2D(u_card, v_uv);
    float t = u_time;
    float aa = max(1.0 / u_resolution.x, 1.0 / u_resolution.y);
    // No effect touches the name, printed icons, stats, or rules parchment.
    float art = smoothstep(0.145, 0.18, p.y) * (1.0 - smoothstep(0.535, 0.565, p.y));
    art *= smoothstep(0.025, 0.065, p.x) * (1.0 - smoothstep(0.94, 0.98, p.x));
    art *= 1.0 - ellipse(p, vec2(0.105, 0.187), vec2(0.075, 0.055));
    art *= 1.0 - ellipse(p, vec2(0.105, 0.263), vec2(0.075, 0.055));
    // The lower icon's small printed "1" badge extends beyond the main circle.
    art *= 1.0 - ellipse(p, vec2(0.157, 0.288), vec2(0.033, 0.024));
    float figure = ellipse(p, vec2(0.36, 0.36), vec2(0.18, 0.22));

    // Move only the red cloth, with the shoulder fixed and the free edge rippling.
    float red = smoothstep(0.055, 0.19, scan.r - max(scan.g, scan.b));
    float cloak = red * smoothstep(0.43, 0.64, p.x) * (1.0 - figure) * art;
    float gust = sin(p.x * 19.0 - t * 2.3 + sin(p.y * 26.0 - t * 0.7));
    vec2 warp = vec2(sin(p.y * 31.0 - t * 1.7) * 0.002, gust * 0.0045) * cloak;
    vec3 color = texture2D(u_card, v_uv + vec2(warp.x, -warp.y)).rgb;
    float fold = sin(p.x * 24.0 + p.y * 17.0 - t * 2.3);
    color *= 1.0 + cloak * fold * 0.14;
    color += vec3(0.10, 0.012, 0.004) * cloak * max(gust, 0.0);

    // Cold light follows the steel head of Бьерсард, not a generic card-wide shine.
    float axe = ellipse(p, vec2(0.657, 0.293), vec2(0.105, 0.067));
    float metal = (1.0 - smoothstep(0.08, 0.24, abs(scan.r - scan.b)))
                * smoothstep(0.20, 0.62, dot(scan.rgb, vec3(0.2126, 0.7152, 0.0722)));
    float sweep = sin(t * 0.95 + u_seed) * 0.12 + 0.80;
    float bladeGlint = exp(-pow((p.x + p.y * 0.48 - sweep) / 0.018, 2.0));
    color += vec3(0.46, 0.65, 0.82) * bladeGlint * axe * metal * art;

    // Wind carries snow behind and around the immovable silhouette.
    float snow = 0.0;
    for (int i = 0; i < 36; i++) {
        float n = float(i) + 1.0;
        float depth = hash(n + 8.3);
        float travel = fract(hash(n) + t * mix(0.075, 0.19, depth));
        vec2 flake = vec2(travel, 0.14 + hash(n + 4.7) * 0.39 + travel * 0.035);
        flake.y += sin(t * 0.8 + n) * 0.006;
        vec2 trail = vec2(mix(0.004, 0.016, depth), 0.002);
        float d = segment(p, flake, flake - trail);
        float radius = mix(0.0008, 0.0022, depth);
        float particle = 1.0 - smoothstep(radius, radius + aa, d);
        float edge = smoothstep(0.0, 0.08, travel) * (1.0 - smoothstep(0.90, 1.0, travel));
        snow += particle * edge * mix(0.3, 0.8, depth) * radius / (radius + aa * 0.35);
    }
    color = mix(color, vec3(0.80, 0.90, 1.0), clamp(snow * art * (1.0 - figure * 0.94), 0.0, 0.8));

    // A blow breaks against his guard: a brief expanding arc, never a full-screen flash.
    float cycle = fract((t + u_seed) / 6.5);
    float impact = smoothstep(0.0, 0.025, cycle) * (1.0 - smoothstep(0.12, 0.28, cycle));
    vec2 guard = (p - vec2(0.37, 0.35)) * vec2(0.71, 1.0);
    float ring = abs(length(guard) - (0.125 + cycle * 0.50));
    float arc = exp(-ring / (0.0025 + aa)) * impact;
    arc *= (1.0 - smoothstep(0.30, 0.52, p.x)) * art * (1.0 - figure);
    color += vec3(0.60, 0.72, 0.85) * arc * 0.30;

    // Edition finish sits on top of the same artwork animation. Overlay blending
    // preserves deep shadows; a moving metallic band catches the snow and steel.
    if (u_is_foil) {
        float phase = dot(p, vec2(1.6, -1.1)) + t * 0.15
                    + sin(p.y * 15.0 - t * 0.7) * 0.10;
        vec3 iridescence = 0.5 + 0.5 * cos(6.2831853 * (phase + vec3(0.0, 0.33, 0.67)));
        vec3 coated = mix(2.0 * color * iridescence,
                         1.0 - 2.0 * (1.0 - color) * (1.0 - iridescence),
                         step(vec3(0.5), color));
        // Let the cloak remain crimson beneath the coating.
        color = mix(color, coated, 0.38 * (1.0 - cloak * 0.30));
        float band = pow(0.5 + 0.5 * sin(p.x * 7.0 + p.y * 5.0 - t * 1.2), 12.0);
        float inkGuard = smoothstep(0.10, 0.42, dot(scan.rgb, vec3(0.2126, 0.7152, 0.0722)));
        color += (1.0 - color) * mix(vec3(0.72, 0.86, 1.0), iridescence, 0.30)
               * band * inkGuard * 0.12;
    }

    // Preserve every pixel outside the illustration, including text contrast.
    color = mix(scan.rgb, color, art);
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), scan.a);
}
