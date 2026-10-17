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

// Ильмара: the painted green and yellow familiars carry her discharge,
// while little currents cross the flowing cloth like an adjacent-cell step.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0 - smoothstep(0.45, 1.0, length((p-c)/r));
}
vec2 spirit(float z, float side, float t, float phase) {
    float x = mix(0.057 + 0.154*z, 0.870 - 0.131*z, side);
    x += mix(0.027, 0.037, side)*sin(z*6.2831853);
    x += 0.009*sin(z*14.0-t*2.6+phase)*sin(z*3.14159265);
    return vec2(x, mix(0.540-0.185*z, 0.540-0.164*z, side));
}
void main() {
    vec2 p = vec2(v_uv.x, 1.0-v_uv.y);
    vec4 scan = texture2D(u_card, v_uv);
    float aa = 0.7/max(u_resolution.x, 1.0);
    float t = max(u_time, 0.0);
    float phase = fract(u_seed*0.1731)*6.2831853;
    // The top cost and faction emblems, left shield and every stat/rule
    // pixel are outside this conservative illustration-only mask.
    float art = smoothstep(0.140, 0.154, p.y)
              * (1.0-smoothstep(0.541, 0.554, p.y))
              * smoothstep(0.027, 0.046, p.x)
              * (1.0-smoothstep(0.950, 0.974, p.x));
    art *= smoothstep(1.0, 1.18, length((p-vec2(0.108,0.180))/vec2(0.058,0.042)));
    vec3 c = scan.rgb;
    float spiritInk = 0.0;
    for (int s=0; s<2; s++) {
        float side = float(s);
        vec3 hue = mix(vec3(0.03,0.91,0.54), vec3(0.86,0.88,0.07), side);
        float z = clamp((0.540-p.y)/mix(0.185,0.164,side),0.0,1.0);
        vec2 path = spirit(z,side,t,phase);
        float d = abs(p.x-path.x);
        float cap = smoothstep(0.0,0.07,z)*(1.0-smoothstep(0.96,1.0,z));
        float wave = pow(0.5+0.5*sin(z*15.0-t*4.7+phase+side*2.0),3.0);
        float filament = (1.0-smoothstep(0.0013,0.0042+aa,d))*cap;
        float halo = exp(-d*80.0)*cap;
        c += hue*(filament*(0.15+0.49*wave)+halo*0.10);
        spiritInk += halo;
        // Clearly travelling sparks climb each creature's existing tail.
        for (int j=0; j<4; j++) {
            float k = float(j);
            float f = fract(k*0.25+t*0.31+side*0.17+phase*0.035);
            vec2 head = spirit(f,side,t,phase);
            float dd = length((p-head)*vec2(1.0,1.40));
            float spark = 1.0-smoothstep(0.002,0.007+aa,dd);
            float glow = exp(-dd*115.0);
            float life = sin(f*3.14159265);
            c += hue*(spark*0.62+glow*0.20)*life;
        }
        vec2 head = mix(vec2(0.211,0.355),vec2(0.742,0.377),side);
        float charge = oval(p,head,vec2(0.046,0.030));
        c += hue*charge*(0.08+0.11*sin(t*4.2+phase+side*1.4));
    }
    // Three small arcing currents visibly pass across the lower white scarf.
    // Their teal-to-gold change connects the two familiar colours.
    for (int j=0; j<3; j++) {
        float k = float(j);
        float f = fract(t*0.22+k/3.0+phase*0.04);
        vec2 head = vec2(0.265+0.435*f,0.494-0.053*sin(f*3.14159265));
        vec2 q = (p-head)*vec2(1.0,1.4);
        float trail = exp(-abs(q.y)*210.0)
                    * smoothstep(-0.079,-0.048,q.x)
                    * (1.0-smoothstep(0.0,0.010,q.x));
        float core = 1.0-smoothstep(0.001,0.005+aa,length(q));
        vec3 hue = mix(vec3(0.04,0.63,0.45),vec3(0.72,0.64,0.09),f);
        c += hue*(trail*0.38+core*0.58)*sin(f*3.14159265);
    }
    if (u_is_foil) {
        // Foil is visible while paused: emerald-gold spectral fabric and
        // copper curls retain the scan's dark folds and painted texture.
        float cloth = oval(p,vec2(0.503,0.447),vec2(0.257,0.100))
                    + oval(p,vec2(0.704,0.324),vec2(0.220,0.124));
        float silver = smoothstep(0.10,0.35,min(scan.r,min(scan.g,scan.b)))
                     * (1.0-smoothstep(0.09,0.23,scan.r-scan.b));
        float hair = oval(p,vec2(0.369,0.239),vec2(0.243,0.094))
                   * smoothstep(0.11,0.30,scan.r-scan.g);
        float foil = clamp(cloth*silver+hair*0.7+spiritInk*0.35,0.0,1.0);
        float angle = p.x*2.1+p.y*1.8-t*0.16+phase*0.06;
        vec3 spectrum = 0.5+0.5*cos(6.2831853*(angle+vec3(0.0,0.33,0.67)));
        c = mix(c,c*(0.63+0.92*spectrum),foil*0.65);
        float glint = pow(0.5+0.5*sin(angle*6.2831853),12.0);
        c += (1.0-c)*spectrum*foil*(0.10+0.40*glint);
        vec3 substrate = 0.5+0.5*cos(6.2831853*(p.x*1.5+p.y-t*0.10+phase*0.035+vec3(0.0,0.33,0.67)));
        vec3 overlay = mix(2.0*c*substrate,1.0-2.0*(1.0-c)*(1.0-substrate),step(vec3(0.5),c));
        c = mix(c,overlay,0.23);
    }
    gl_FragColor = vec4(mix(scan.rgb,clamp(c,0.0,1.0),art),scan.a);
}
