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

// Рангхильда, 80/69: three support charges follow the actual whip into
// her gripping hand, turquoise mantle, right wrist and raised ice blade.
// Landmarks use top-left coordinates of the 496 x 700 illustration.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0 - smoothstep(0.45, 1.0, length((p - c) / r));
}
vec2 bend(vec2 a, vec2 b, vec2 c, float s) {
    return mix(mix(a, b, s), mix(b, c, s), s);
}
vec2 supportPath(float s) {
    float f = s * 8.0;
    if (f < 1.0) return bend(vec2(0.027,0.460), vec2(0.133,0.443), vec2(0.189,0.353), f);
    if (f < 2.0) return bend(vec2(0.189,0.353), vec2(0.283,0.300), vec2(0.205,0.295), f-1.0);
    if (f < 3.0) return bend(vec2(0.205,0.295), vec2(0.115,0.218), vec2(0.207,0.189), f-2.0);
    if (f < 4.0) return bend(vec2(0.207,0.189), vec2(0.277,0.170), vec2(0.286,0.229), f-3.0);
    if (f < 5.0) return bend(vec2(0.286,0.229), vec2(0.324,0.296), vec2(0.465,0.293), f-4.0);
    if (f < 6.0) return bend(vec2(0.465,0.293), vec2(0.575,0.323), vec2(0.658,0.284), f-5.0);
    if (f < 7.0) return bend(vec2(0.658,0.284), vec2(0.648,0.371), vec2(0.744,0.397), f-6.0);
    return bend(vec2(0.744,0.397), vec2(0.794,0.295), vec2(0.863,0.208), f-7.0);
}
float pulse(float s, float head) {
    float d = fract(s - head + 0.5) - 0.5;
    return exp(-d * d / 0.00072);
}
void main() {
    vec2 p = vec2(v_uv.x, 1.0 - v_uv.y);
    vec4 scan = texture2D(u_card, v_uv);
    float aa = max(1.0 / max(u_resolution.x, 1.0),
                   1.4113 / max(u_resolution.y, 1.0));
    float t = max(u_time, 0.0);
    float seed = fract(u_seed * 0.137);
    float art = smoothstep(0.140, 0.155, p.y)
              * (1.0 - smoothstep(0.540, 0.559, p.y))
              * smoothstep(0.010, 0.029, p.x)
              * (1.0 - smoothstep(0.969, 0.990, p.x));
    // Printed shield is independent of the artwork, even beside the whip.
    art *= smoothstep(1.0, 1.18,
                     length((p - vec2(0.109,0.181)) / vec2(0.058,0.040)));
    vec3 color = scan.rgb;
    float luma = dot(scan.rgb, vec3(0.2126,0.7152,0.0722));
    float cyanInk = smoothstep(0.025,0.22,min(scan.g,scan.b)-scan.r);
    float face = oval(p,vec2(0.554,0.239),vec2(0.075,0.058));

    // Painted lightning behind the blade answers the attacks. Its white core
    // and blue surrounding sky brighten locally without moving scan pixels.
    float storm = oval(p,vec2(0.881,0.377),vec2(0.126,0.180))
                + oval(p,vec2(0.751,0.195),vec2(0.081,0.069));
    float thunder = pow(0.5+0.5*sin(t*2.15+seed*6.2831853),10.0);
    float fork = pow(0.5+0.5*sin(t*4.30+seed*6.2831853-0.6),18.0);
    color += vec3(0.055,0.092,0.150) * min(storm,1.0)
           * (0.12+thunder*0.75+fork*0.25) * smoothstep(0.22,0.84,luma);

    // Three successive packets relay through the painted equipment, echoing
    // the three boosts granted by attacks through an ally. Projection onto
    // each short segment gives a continuous trail at small display sizes.
    float charge = 0.0;
    float halo = 0.0;
    float head = fract(t*0.145+seed);
    for (int i=0; i<32; i++) {
        float s0 = float(i)/32.0;
        vec2 a = supportPath(s0);
        vec2 b = supportPath(s0+1.0/32.0);
        vec2 ab = (b-a)*vec2(1.0,1.4113);
        vec2 ap = (p-a)*vec2(1.0,1.4113);
        float along = clamp(dot(ap,ab)/max(dot(ab,ab),0.000001),0.0,1.0);
        float d = length(ap-ab*along);
        float s = s0+along/32.0;
        float packets = pulse(s,head)+pulse(s,head-0.105)+pulse(s,head-0.210);
        float core = 1.0-smoothstep(0.0014,0.0030+aa,d);
        float glow = exp(-d*d/0.00017);
        charge = max(charge,core*packets);
        halo = max(halo,glow*packets);
    }
    color += vec3(0.12,0.55,0.65)*charge*(1.0-face);
    color += vec3(0.013,0.085,0.12)*halo*(1.0-face);

    float mantle = oval(p,vec2(0.560,0.303),vec2(0.141,0.063));
    float receive = pulse(0.705,head)+pulse(0.705,head-0.105)+pulse(0.705,head-0.210);
    color += vec3(0.025,0.16,0.18)*mantle*cyanInk*(0.14+receive*0.65);
    // Reinforcement remains briefly in the actual blade after each arrival.
    float blade = oval(p,vec2(0.820,0.281),vec2(0.058,0.094))*cyanInk;
    float release = pulse(0.958,head)+pulse(0.958,head-0.105)+pulse(0.958,head-0.210);
    color += vec3(0.10,0.24,0.28)*blade*(0.12+release*0.85);

    if (u_is_foil) {
        // Separate silver/iridescent reflections on the dagger, forearm bands
        // and belt fittings; fur, skin and all printed frames retain their ink.
        float cuffs = oval(p,vec2(0.659,0.344),vec2(0.043,0.045))
                    + oval(p,vec2(0.333,0.268),vec2(0.040,0.034));
        float belt = oval(p,vec2(0.502,0.458),vec2(0.054,0.054));
        float metal = clamp(blade + (cuffs+belt)*smoothstep(0.23,0.65,luma),0.0,1.0);
        float phase = p.x*3.8+p.y*2.4-t*0.24+seed;
        vec3 spectrum = 0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        float sheen = pow(0.5+0.5*sin(phase*6.2831853),12.0);
        vec3 reflection = mix(vec3(0.70,0.91,1.0),spectrum,0.55);
        color *= 1.0-metal*(0.05+0.11*(1.0-sheen));
        color += (1.0-color)*reflection*metal*(0.19+0.78*sheen);
        // A restrained full-art foil substrate keeps the edition recognizable
        // at listing size; the stronger, art-specific metal highlights remain above.
        vec3 finishHue = 0.5 + 0.5*cos(6.2831853*(p.x*1.4+p.y*0.9-t*0.12+seed*0.07+vec3(0.0,0.33,0.67)));
        vec3 finishOverlay = mix(2.0*color*finishHue,
            1.0-2.0*(1.0-color)*(1.0-finishHue),step(vec3(0.5),color));
        color = mix(color,finishOverlay,0.28);
    }
    gl_FragColor = vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
