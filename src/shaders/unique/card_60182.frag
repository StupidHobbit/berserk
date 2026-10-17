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

// Three resurrected companions feed the emerald heart of Adrelian.
// Positions follow the skulls and spectral ribbons in the original painting.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.18,1.0,length((p-c)/r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 q=(p-a)*vec2(1.0,1.41129);
    vec2 v=(b-a)*vec2(1.0,1.41129);
    return length(q-v*clamp(dot(q,v)/max(dot(v,v),0.000001),0.0,1.0));
}
vec2 tether(float s, vec2 a, vec2 b, float bend, float t) {
    vec2 q=mix(a,b,s);
    q+=vec2(bend*sin(3.141593*s),0.010*sin(s*9.0-t)*sin(3.141593*s));
    return q;
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 base=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.41129/max(u_resolution.y,1.0));
    float t=max(0.0,u_time);
    float seed=fract(u_seed*0.137);
    float clock=t+seed*4.0;
    float art=smoothstep(0.142,0.153,p.y)*(1.0-smoothstep(0.535,0.548,p.y));
    art*=smoothstep(0.008,0.020,p.x)*(1.0-smoothstep(0.980,0.993,p.x));
    art*=smoothstep(1.0,1.17,length((p-vec2(0.110,0.183))/vec2(0.064,0.041)));
    vec3 color=base.rgb;
    float lum=dot(base.rgb,vec3(0.2126,0.7152,0.0722));
    float cyan=smoothstep(0.01,0.20,base.b-base.r*0.85);
    float pulse=0.5+0.5*sin(clock*1.65);
    vec2 heart=vec2(0.443,0.326);
    float heartMask=oval(p,heart,vec2(0.109,0.082));
    float skull=oval(p,vec2(0.439,0.204),vec2(0.057,0.050));
    color+=(1.0-color)*vec3(0.24,0.65,0.14)*heartMask*(0.20+0.35*pulse);
    color+=(1.0-color)*vec3(0.16,0.61,0.70)*skull*(0.16+0.17*pulse);

    float filaments=0.0;
    float glow=0.0;
    float companions=0.0;
    float eyes=0.0;
    for(int j=0;j<3;j++) {
        float n=float(j);
        vec2 source=vec2(0.198,0.479);
        vec2 radius=vec2(0.100,0.064);
        float bend=-0.048;
        if(j==1) { source=vec2(0.565,0.403); radius=vec2(0.068,0.059); bend=0.048; }
        if(j==2) { source=vec2(0.682,0.143); radius=vec2(0.105,0.062); bend=0.062; }
        float soul=oval(p,source,radius);
        float breath=0.55+0.45*sin(clock*1.65-n*1.7);
        companions+=soul*(0.50+0.50*breath);
        // Light stays inside each painted skull; the black eye sockets survive.
        color+=(1.0-color)*vec3(0.20,0.69,0.85)*soul*(0.17+0.32*breath)*cyan;
        float eye=oval(p,source+vec2(-0.016,-0.010),vec2(0.008,0.007));
        eye+=oval(p,source+vec2(0.015,-0.006),vec2(0.007,0.006));
        eyes+=eye*(0.3+0.4*breath);
        for(int i=0;i<10;i++) {
            float s=float(i)/10.0;
            float sn=(float(i)+1.0)/10.0;
            vec2 a=tether(s,source,heart,bend,clock+n*2.0);
            vec2 b=tether(sn,source,heart,bend,clock+n*2.0);
            float d=segment(p,a,b);
            float flow=0.25+0.75*pow(0.5+0.5*cos(s*12.0-clock*2.8+n*2.1),4.0);
            float taper=0.35+0.65*sin(s*3.141593);
            filaments=max(filaments,(1.0-smoothstep(0.0007,0.0022+aa,d))*flow*taper);
            glow=max(glow,exp(-d*d/0.00014)*flow*taper);
        }
        // A single bright soul mote travels inward along each tether.
        float age=fract(clock*0.18+n/3.0);
        vec2 mote=tether(age,source,heart,bend,clock+n*2.0);
        float d=length((p-mote)*vec2(1.0,1.41129));
        float visible=sin(age*3.141593);
        filaments+=(1.0-smoothstep(0.002,0.005+aa,d))*visible;
        glow+=exp(-d*d/0.00025)*visible*0.4;
    }
    color+=(1.0-color)*vec3(0.12,0.56,0.69)*glow*0.47;
    color+=vec3(0.27,0.68,0.70)*filaments*0.65;
    color+=vec3(0.12,0.32,0.34)*eyes;
    // The raised hand and the necromancer's eyes answer the companions.
    float hand=oval(p,vec2(0.806,0.165),vec2(0.032,0.035));
    float masterEyes=oval(p,vec2(0.430,0.204),vec2(0.008,0.006))
                    +oval(p,vec2(0.462,0.198),vec2(0.007,0.006));
    color+=vec3(0.18,0.72,0.69)*(masterEyes*(0.45+0.45*pulse)+hand*0.20);

    if(u_is_foil) {
        float armor=oval(p,vec2(0.456,0.383),vec2(0.226,0.203));
        armor+=oval(p,vec2(0.655,0.281),vec2(0.151,0.067));
        float phase=p.x*1.9+p.y*2.8+0.12*sin(p.y*23.0+p.x*9.0)-t*0.10+seed*0.23;
        vec3 spectrum=0.5+0.5*cos(6.283185*(phase+vec3(0.0,0.333,0.667)));
        float metal=clamp(0.30+armor*0.32+companions*0.16,0.0,0.78)*(1.0-skull*0.70);
        vec3 plated=mix(2.0*color*spectrum,1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        color=mix(color,plated,metal*0.57);
        float sheen=pow(0.5+0.5*sin(p.x*17.0-p.y*24.0+t*1.0),7.0);
        vec3 silver=mix(vec3(0.72,0.92,0.95),spectrum,0.48);
        color+=(1.0-color)*silver*metal*(0.16+0.47*sheen);
        color+=(1.0-color)*vec3(0.58,0.88,0.85)*companions*(0.10+0.21*sheen);
        color+=(1.0-color)*silver*armor*smoothstep(0.18,0.61,lum)*0.17;
    }
    gl_FragColor=vec4(mix(base.rgb,clamp(color,0.0,1.0),art),base.a);
}
