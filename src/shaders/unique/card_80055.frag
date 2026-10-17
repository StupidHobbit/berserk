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

// Норбран: mountain reserves climb his gold staff; hoofbeats gain a charge,
// then the staff releases a forked magical strike into the surrounding ice.
// Coordinates are measured from the top left of the actual 496 x 700 scan.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0 - smoothstep(0.60, 1.0, length((p - c) / r));
}
float lineDistance(vec2 p, vec2 a, vec2 b) {
    vec2 d = b - a;
    return length(p - a - d * clamp(dot(p - a, d) / dot(d, d), 0.0, 1.0));
}
float current(vec2 p, vec2 a, vec2 b, float aa) {
    float d = lineDistance(p, a, b);
    return (1.0 - smoothstep(0.0007, 0.0017 + aa, d)) * 0.65
         + exp(-d / 0.007) * 0.20;
}

void main() {
    vec2 p = vec2(v_uv.x, 1.0 - v_uv.y);
    vec4 scan = texture2D(u_card, v_uv);
    float aa = max(1.0 / max(u_resolution.x, 1.0),
                   1.0 / max(u_resolution.y, 1.0));
    float t = max(u_time, 0.0);
    float seed = fract(u_seed * 0.137) * 6.2831853;

    // The art stops BEFORE the stat frames. Upper ornaments, title and class
    // strip are immutable, even where the goat's horns overlap the border.
    float art = smoothstep(0.138, 0.153, p.y)
              * (1.0 - smoothstep(0.544, 0.556, p.y));
    art *= smoothstep(0.020, 0.040, p.x)
         * (1.0 - smoothstep(0.956, 0.979, p.x));
    // Include the printed shield's outer rim and its antialias fringe.
    art *= smoothstep(0.060, 0.075,
                      length((p - vec2(0.109, 0.181)) * vec2(1.0, 1.42)));
    vec3 color = scan.rgb;
    float luminance = dot(scan.rgb, vec3(0.2126, 0.7152, 0.0722));
    float iceInk = smoothstep(0.18, 0.72, luminance)
                 * smoothstep(0.015, 0.15, scan.b - scan.r);
    float cycle = fract(t * 0.135 + seed * 0.07);
    float charge = smoothstep(0.0, 0.70, cycle);
    float strike = smoothstep(0.68, 0.76, cycle)
                 * (1.0 - smoothstep(0.80, 0.96, cycle));

    // Four mountain reservoirs: luminous veins belong to the painted ice,
    // leaving the rider's skin and the black animal silhouette untouched.
    float reservoirs = oval(p, vec2(0.090, 0.421), vec2(0.067, 0.087))
                     + oval(p, vec2(0.169, 0.354), vec2(0.048, 0.059))
                     + oval(p, vec2(0.875, 0.343), vec2(0.076, 0.086))
                     + oval(p, vec2(0.902, 0.464), vec2(0.060, 0.074));
    float vein = pow(0.5 + 0.5 * sin(p.y * 67.0 + p.x * 39.0 - t * 1.2 + seed), 5.0);
    color += vec3(0.10, 0.35, 0.43) * reservoirs * iceInk
           * (0.16 + vein * 0.42 + charge * 0.16);

    // Hoofbeats charge the ground. Elliptical wakes stay under the two
    // visible front legs and fade continuously before each cycle wraps.
    float wakes = 0.0;
    for (int i = 0; i < 2; i++) {
        float k = float(i);
        vec2 hoof = vec2(0.611 + k * 0.135, 0.541 - k * 0.002);
        float travel = fract(t * 0.40 + k * 0.50 + seed * 0.06);
        float radius = 0.009 + travel * 0.073;
        float d = abs(length((p - hoof) * vec2(1.0, 3.0)) - radius);
        float fade = smoothstep(0.0, 0.12, travel)
                   * (1.0 - smoothstep(0.50, 1.0, travel));
        wakes += (1.0 - smoothstep(0.001, 0.003 + aa * 1.8, d)) * fade;
    }
    color += vec3(0.18, 0.45, 0.54) * wakes * 0.40;

    // Gold staff: the shaft is fixed at its lower tip, wrist, and crook.
    vec2 foot = vec2(0.320, 0.423);
    vec2 wrist = vec2(0.260, 0.258);
    vec2 crown = vec2(0.246, 0.169);
    float shaft = current(p, foot, wrist, aa) + current(p, wrist, crown, aa);
    float feed = current(p, vec2(0.094, 0.474), vec2(0.171, 0.488), aa)
               + current(p, vec2(0.171, 0.488), vec2(0.249, 0.451), aa)
               + current(p, vec2(0.249, 0.451), foot, aa);
    color += vec3(0.11, 0.32, 0.41) * feed * (0.16 + charge * 0.20);
    color += vec3(0.60, 0.40, 0.12) * shaft * (0.20 + charge * 0.24);
    // Four individually visible charge packets rise along the real shaft.
    float sparks = 0.0;
    for (int i = 0; i < 4; i++) {
        float q = fract(t * 0.19 + float(i) * 0.25 + seed * 0.05);
        vec2 spot = q < 0.65 ? mix(foot, wrist, q / 0.65)
                            : mix(wrist, crown, (q - 0.65) / 0.35);
        float d = length((p - spot) * vec2(1.0, 1.42));
        float fade = smoothstep(0.0, 0.09, q) * (1.0 - smoothstep(0.88, 1.0, q));
        sparks += fade * ((1.0 - smoothstep(0.0015, 0.003 + aa, d))
                         + exp(-d / 0.011) * 0.23);
    }
    color += vec3(0.65, 0.72, 0.41) * sparks * 0.70;
    float source = oval(p, crown, vec2(0.039, 0.030));
    color += vec3(0.29, 0.36, 0.14) * source * (0.30 + charge * 0.36 + strike * 0.45);

    // The crook fires two angular branches through open mountain scenery.
    // Their fixed routes avoid the face, long white hair and animal's head.
    float bolt = current(p, crown, vec2(0.208, 0.216), aa)
               + current(p, vec2(0.208, 0.216), vec2(0.225, 0.237), aa)
               + current(p, vec2(0.225, 0.237), vec2(0.145, 0.300), aa)
               + current(p, vec2(0.145, 0.300), vec2(0.170, 0.318), aa)
               + current(p, vec2(0.170, 0.318), vec2(0.104, 0.386), aa);
    float branch = current(p, vec2(0.225, 0.237), vec2(0.175, 0.247), aa)
                 + current(p, vec2(0.175, 0.247), vec2(0.149, 0.282), aa)
                 + current(p, vec2(0.149, 0.282), vec2(0.087, 0.303), aa);
    color += vec3(0.48, 0.74, 0.82) * (bolt + branch * 0.65) * strike * 0.72;

    if (u_is_foil) {
        // Prismatic crystal facets catch a separate foil wave; gold catches
        // its warm edge. The finish is spatially tied to ice and the staff.
        float facets = p.x * 9.0 + p.y * 6.0
                     + abs(sin(p.x * 24.0 - p.y * 17.0)) * 0.24;
        float phase = facets * 0.30 - t * 0.09 + seed * 0.12;
        vec3 spectrum = 0.5 + 0.5 * cos(6.2831853 * (phase + vec3(0.0, 0.33, 0.67)));
        vec3 coated = mix(2.0 * color * spectrum,
                         1.0 - 2.0 * (1.0 - color) * (1.0 - spectrum),
                         step(vec3(0.5), color));
        float finish = clamp(reservoirs * 0.65 + shaft * 0.25, 0.0, 0.85);
        color = mix(color, coated, finish * 0.40);
        float shimmer = pow(0.5 + 0.5 * sin(facets * 2.0 - t * 0.85), 12.0);
        color += (1.0 - color) * (vec3(0.10, 0.16, 0.18) + spectrum * 0.20)
               * shimmer * finish * smoothstep(0.16, 0.65, luminance);
        // Low-strength foil substrate remains recognizable at compact size;
        // the card-specific metallic details above keep their stronger highlights.
        vec3 finishHue = 0.5 + 0.5*cos(6.2831853*(p.x*1.4+p.y*0.9-t*0.12+seed*0.07+vec3(0.0,0.33,0.67)));
        vec3 finishOverlay = mix(2.0*color*finishHue,
            1.0-2.0*(1.0-color)*(1.0-finishHue),step(vec3(0.5),color));
        color = mix(color,finishOverlay,0.25);

    }

    // Exact original pixels everywhere outside the softly bounded art mask.
    gl_FragColor = vec4(mix(scan.rgb, clamp(color, 0.0, 1.0), art), scan.a);
}
