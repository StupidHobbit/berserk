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

float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.25,1.0,length((p-c)/r));
}
float line(vec2 p,vec2 a,vec2 b,float aa) {
    vec2 q=(p-a)*vec2(1.0,1.4113);
    vec2 v=(b-a)*vec2(1.0,1.4113);
    float d=length(q-v*clamp(dot(q,v)/max(dot(v,v),0.000001),0.0,1.0));
    return 1.0-smoothstep(0.001,0.002+aa,d);
}

void main() {
    vec4 original=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.1731)*6.2831853;
    float art=smoothstep(0.140,0.157,p.y)*(1.0-smoothstep(0.537,0.558,p.y));
    art*=smoothstep(0.012,0.030,p.x)*(1.0-smoothstep(0.971,0.990,p.x));
    art*=smoothstep(1.0,1.16,length((p-vec2(0.108,0.181))/vec2(0.063,0.043)));
    art*=smoothstep(1.0,1.13,length((p-vec2(0.108,0.078))/vec2(0.092,0.069)));
    art*=smoothstep(1.0,1.13,length((p-vec2(0.884,0.079))/vec2(0.083,0.070)));
    if(art<=0.0) { gl_FragColor=original; return; }
    vec3 color=original.rgb;
    float warm=smoothstep(0.06,0.30,original.r-original.b);
    float face=oval(p,vec2(0.622,0.207),vec2(0.075,0.065));
    float cycle=t*0.18+seed*0.06;
    float discharge=pow(0.5+0.5*sin(cycle*6.2831853),10.0);

    // Four curse charges orbit into the central gold clasp, one for each
    // protected Coven member. They then feed the two painted spell hands.
    float motes=0.0;
    float trails=0.0;
    for(int i=0;i<4;i++) {
        float k=float(i);
        float age=fract(cycle+k*0.25);
        float a=k*1.5707963+age*3.8+seed;
        float radius=mix(0.205,0.013,age);
        vec2 c=vec2(0.600,0.333)+vec2(cos(a),sin(a)*0.60)*radius;
        float d=length((p-c)*vec2(1.0,1.4113));
        float life=sin(age*3.14159265);
        motes+=(1.0-smoothstep(0.002,0.006+aa,d))*life;
        motes+=exp(-d*125.0)*0.45*life;
        vec2 tail=c+vec2(sin(a),-cos(a)*0.60)*0.023;
        trails+=line(p,c,tail,aa)*life;
    }
    color+=vec3(0.08,0.43,0.40)*(motes*0.78+trails*0.36)*(1.0-face);
    float clasp=oval(p,vec2(0.601,0.333),vec2(0.043,0.035));
    color+=(1.0-color)*vec3(0.95,0.54,0.10)*clasp*(0.18+discharge*0.72);

    // The cyan ward curls round his left palm; the large painted fire disc
    // on the right gains rotating tongues and an outward travelling rim.
    vec2 l=(p-vec2(0.391,0.219))*vec2(1.0,1.4113);
    float lr=length(l);
    float la=atan(l.y,l.x);
    float wardRadius=0.074+0.006*sin(la*3.0-t*1.8+seed);
    float ward=(1.0-smoothstep(0.002,0.006+aa,abs(lr-wardRadius)));
    ward*=0.32+0.68*pow(0.5+0.5*cos(la*2.0+t*2.0),3.0);
    color+=vec3(0.07,0.45,0.47)*ward*0.72;
    vec2 q=(p-vec2(0.881,0.235))*vec2(1.0,1.4113);
    float r=length(q);
    float a=atan(q.y,q.x);
    float radius=0.107+0.010*sin(a*5.0-t*2.1+seed)+0.004*sin(a*9.0+t*1.7);
    float ring=1.0-smoothstep(0.003,0.011+aa,abs(r-radius));
    float halo=exp(-abs(r-radius)*45.0);
    float flames=pow(0.5+0.5*sin(a*7.0-r*74.0+t*3.0+seed),5.0);
    flames*=(1.0-smoothstep(0.108,0.155,r))*smoothstep(0.045,0.089,r);
    color+=(1.0-color)*vec3(1.0,0.63,0.11)*(ring*0.50+halo*0.15+flames*0.50);
    float rightPalm=oval(p,vec2(0.884,0.235),vec2(0.047,0.043));
    float leftPalm=oval(p,vec2(0.391,0.216),vec2(0.035,0.035));
    color+=(1.0-color)*vec3(1.0,0.85,0.36)*rightPalm*(0.18+discharge*0.65);
    color+=vec3(0.07,0.36,0.34)*leftPalm*(0.20+discharge*0.50);

    // Two short jagged discharges are rooted in the outstretched fingers.
    float jitter=0.005*sin(t*23.0+seed);
    vec2 bend=vec2(0.937+jitter,0.203);
    float bolt=line(p,vec2(0.894,0.222),bend,aa)
              +line(p,bend,vec2(0.919,0.178),aa)
              +line(p,vec2(0.919,0.178),vec2(0.956,0.159),aa);
    color+=vec3(0.65,0.52,0.23)*bolt*discharge;

    if(u_is_foil) {
        // Hot hammered gold on the robe and brass ornaments, with spectral
        // diffraction across the spell disc. A broad foil substrate remains
        // obvious on the small listing card as the metallic band passes.
        float robe=oval(p,vec2(0.518,0.406),vec2(0.275,0.183));
        float shoulders=oval(p,vec2(0.590,0.273),vec2(0.222,0.078));
        float cuffs=oval(p,vec2(0.410,0.271),vec2(0.064,0.044))
                   +oval(p,vec2(0.809,0.280),vec2(0.070,0.044));
        float metal=clamp(robe*warm+shoulders*warm+cuffs+clasp+halo*0.45,0.0,1.0)*(1.0-face*0.90);
        float phase=p.x*1.7-p.y*2.6-t*0.19+seed*0.09;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        float shine=pow(0.5+0.5*sin(phase*6.2831853),7.0);
        float facets=0.5+0.5*sin(p.x*143.0+p.y*93.0+sin(p.y*77.0));
        color*=1.0-metal*(0.15+0.06*facets);
        color+=(1.0-color)*mix(vec3(1.0,0.80,0.36),spectrum,0.70)*metal*(0.30+shine*0.85);
        vec3 foilHue=0.5+0.5*cos(6.2831853*(p.x*1.4+p.y*0.8-t*0.12+seed*0.07+vec3(0.0,0.33,0.67)));
        vec3 overlay=mix(2.0*color*foilHue,1.0-2.0*(1.0-color)*(1.0-foilHue),step(vec3(0.5),color));
        color=mix(color,overlay,0.28*(1.0-face*0.75));
    }
    gl_FragColor=vec4(mix(original.rgb,clamp(color,0.0,1.0),art),original.a);
}
