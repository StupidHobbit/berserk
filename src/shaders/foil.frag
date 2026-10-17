#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_card;
uniform vec2 u_resolution;
// Seconds; held at zero for reduced motion. No cursor-dependent inputs.
uniform float u_time;
uniform float u_seed;
varying vec2 v_uv;

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}
vec3 spectrum(float phase) {
    return 0.5 + 0.5 * cos(6.2831853 * (phase + vec3(0.0, 0.33, 0.67)));
}
// Overlay blend preserves black ink and white highlights instead of bleaching them.
vec3 overlay(vec3 ink, vec3 finish) {
    return mix(2.0 * ink * finish,
               1.0 - 2.0 * (1.0 - ink) * (1.0 - finish), step(vec3(0.5), ink));
}
void main() {
    vec4 scan = texture2D(u_card, v_uv);
    vec2 p = vec2(v_uv.x, 1.0 - v_uv.y);
    float time = u_time * 3.0;
    // Sweep the light across the artwork independently of the card's CSS tilt.
    vec2 light = vec2(0.5, 0.43) + vec2(0.32, 0.23)
               * sin(vec2(time * 0.45, time * 0.31) + vec2(u_seed, u_seed + 1.57));
    float shimmer = 0.5 + 0.5 * sin(time * 0.6 + u_seed);
    // Concentrate the finish over the illustration, away from the name and rules.
    float artwork = smoothstep(0.12, 0.26, p.y) * (1.0 - smoothstep(0.54, 0.77, p.y));
    float coverage = mix(0.10, 1.0, artwork);
    float wave = sin(p.y * 19.0 + p.x * 8.0 + time * 0.55 + u_seed);
    float phase = dot(p, vec2(1.8, -1.2)) + wave * 0.12
                + dot(light - 0.5, vec2(0.6, -0.4)) + time * 0.065 + u_seed;
    vec3 rainbow = spectrum(phase);
    // Keep the finish smooth: thin periodic stripes alias when cards are scaled.
    float strength = coverage * (0.23 + 0.12 * shimmer);
    vec3 color = mix(scan.rgb, overlay(scan.rgb, rainbow), strength);

    vec2 delta = (p - light) * vec2(0.71, 1.0);
    float reflection = exp(-dot(delta, delta) * 24.0);
    // Fixed, sparse grain with jittered centers instead of illuminated square cells.
    // Integrate each glint over an approximate pixel footprint so compact cards
    // fade subpixel sparkle rather than showing a crawling grid.
    vec2 grid = vec2(72.0, 102.0);
    vec2 grainPosition = p * grid;
    vec2 cell = floor(grainPosition);
    float grain = hash(cell + u_seed);
    vec2 center = 0.25 + 0.5 * vec2(hash(cell + u_seed + 7.1), hash(cell + u_seed + 19.7));
    float radius = 0.10;
    float pixel = max(grid.x / u_resolution.x, grid.y / u_resolution.y);
    float distanceToGlint = length(fract(grainPosition) - center);
    float shape = 1.0 - smoothstep(max(0.0, radius - pixel), radius + pixel, distanceToGlint);
    float visibility = radius / (radius + pixel);
    float glint = pow(max(0.0, sin(time * 1.8 + grain * 31.0 + p.x * 7.0)), 18.0);
    float sparkle = smoothstep(0.94, 0.99, grain) * glint * shape * visibility;
    // Dark pixels receive almost no additive light: fine card text stays dark.
    float luminance = dot(scan.rgb, vec3(0.2126, 0.7152, 0.0722));
    float inkGuard = smoothstep(0.10, 0.42, luminance);
    float shine = coverage * inkGuard * (reflection * (0.025 + shimmer * 0.055)
                + sparkle * (0.16 + reflection * 0.22));
    color += (1.0 - color) * shine * mix(vec3(1.0), rainbow, 0.25);
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), scan.a);
}
