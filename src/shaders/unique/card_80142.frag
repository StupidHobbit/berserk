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
    return 1.0-smoothstep(0.45,1.0,length((p-c)/r));
}
float wire(vec2 p, vec2 a, vec2 b, float aa) {
    vec2 q=(p-a)*vec2(1.0,1.4113);
    vec2 v=(b-a)*vec2(1.0,1.4113);
    float d=length(q-v*clamp(dot(q,v)/max(dot(v,v),0.000001),0.0,1.0));
    return 1.0-smoothstep(0.0007,0.0016+aa,d);
}
vec2 exchangePath(float s) {
    // A sweeping underwater arc skirts the bottom of her extended hand.
    vec2 a=vec2(0.207,0.314);
    vec2 b=vec2(0.280,0.548);
    vec2 c=vec2(0.880,0.491);
    return mix(mix(a,b,s),mix(b,c,s),s);
}
float wake(vec2 p, vec2 c, float time, float aa) {
    vec2 q=(p-c)*vec2(1.0,3.7);
    float r=length(q);
    float w=0.0;
    for(int i=0;i<3;i++) {
        float age=fract(time+float(i)/3.0);
        float radius=0.014+age*0.087;
        float fade=sin(age*3.14159265);
        w+=(1.0-smoothstep(0.001,0.002+aa,abs(r-radius)))*fade;
    }
    return w;
}

void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.1731)*6.2831853;
    // Entire printed name, class line, cost/faction badges and lower stats
    // remain the original sample. Coordinates are measured from scan top.
    float art=smoothstep(0.142,0.157,p.y)*(1.0-smoothstep(0.540,0.558,p.y));
    art*=smoothstep(0.021,0.043,p.x)*(1.0-smoothstep(0.957,0.980,p.x));
    art*=smoothstep(1.0,1.17,length((p-vec2(0.108,0.078))/vec2(0.090,0.068)));
    art*=smoothstep(1.0,1.16,length((p-vec2(0.887,0.079))/vec2(0.083,0.070)));
    if(art<=0.0) { gl_FragColor=scan; return; }
    vec3 color=scan.rgb;
    float lum=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
    float pink=smoothstep(0.025,0.18,scan.r-scan.g);
    float face=oval(p,vec2(0.811,0.208),vec2(0.104,0.081));
    float body=oval(p,vec2(0.490,0.358),vec2(0.240,0.185));
    float skin=clamp(pink+face,0.0,1.0);
    float river=(1.0-skin)*smoothstep(0.012,0.11,scan.g-scan.r*0.80);

    // The two river stations answer one another: a pair of opposite-moving
    // lights visibly trade places along a crescent under her reaching palm.
    float cycle=t*0.15+seed*0.07;
    float packetA=0.5-0.5*cos(cycle*6.2831853);
    float packetB=1.0-packetA;
    float strand=0.0;
    float pearls=0.0;
    for(int i=0;i<28;i++) {
        float s=float(i)/28.0;
        vec2 a=exchangePath(s);
        vec2 b=exchangePath(s+1.0/28.0);
        float undulation=sin(s*12.0-t*1.7+seed)*sin(s*3.14159265)*0.005;
        a.y+=undulation;
        b.y+=sin((s+1.0/28.0)*12.0-t*1.7+seed)*sin((s+1.0/28.0)*3.14159265)*0.005;
        vec2 v=(b-a)*vec2(1.0,1.4113);
        vec2 q=(p-a)*vec2(1.0,1.4113);
        float f=clamp(dot(q,v)/max(dot(v,v),0.000001),0.0,1.0);
        float d=length(q-v*f);
        float pos=s+f/28.0;
        float da=pos-packetA;
        float db=pos-packetB;
        float energy=exp(-da*da/0.0025)+exp(-db*db/0.0025);
        strand=max(strand,(1.0-smoothstep(0.0006,0.0015+aa,d))*(0.08+energy*0.70));
        pearls=max(pearls,exp(-d*d/0.00010)*energy);
    }
    float clearWater=1.0-skin*0.92;
    color+=vec3(0.25,0.15,0.35)*strand*clearWater;
    color+=vec3(0.09,0.035,0.14)*pearls*clearWater;
    float arrival=pow(abs(cos(cycle*6.2831853)),5.0);
    float rings=wake(p,vec2(0.207,0.314),cycle,aa)
               +wake(p,vec2(0.880,0.491),cycle+0.5,aa);
    color+=vec3(0.13,0.29,0.28)*rings*river*(0.30+arrival*0.50);

    // A two-beat discharge starts at the actual outstretched fingertips and
    // forks toward the painted right-hand lotus, illuminating its petals.
    float beat=fract(t*0.245+seed*0.041);
    float pulse=exp(-pow((beat-0.62)/0.042,2.0))
               +0.63*exp(-pow((beat-0.76)/0.026,2.0));
    float jitter=sin(t*17.0+seed)*0.008;
    vec2 tip=vec2(0.824,0.453);
    vec2 joint=vec2(0.858+jitter,0.444);
    vec2 bend=vec2(0.850,0.424);
    vec2 lotus=vec2(0.883,0.420);
    float bolt=wire(p,tip,joint,aa)+wire(p,joint,bend,aa)+wire(p,bend,lotus,aa);
    bolt+=0.52*wire(p,joint,vec2(0.904,0.455),aa);
    color+=vec3(0.58,0.43,0.65)*bolt*pulse;
    float palm=oval(p,vec2(0.710,0.482),vec2(0.068,0.045));
    color+=(1.0-color)*vec3(0.24,0.085,0.26)*palm*(0.2+0.8*pulse);
    float flowers=oval(p,vec2(0.213,0.252),vec2(0.069,0.048))
                 +oval(p,vec2(0.421,0.266),vec2(0.044,0.026))
                 +oval(p,lotus,vec2(0.044,0.030));
    color+=(1.0-color)*vec3(0.24,0.07,0.22)*flowers*pink*(0.20+0.60*arrival+0.40*pulse);
    float caustic=pow(0.5+0.5*sin(p.y*135.0+sin(p.x*36.0+t*0.7)*1.8-t*1.9),12.0);
    color+=vec3(0.025,0.10,0.085)*river*caustic*(1.0-body*0.5);

    if(u_is_foil) {
        // Foil follows silver-black hair, ivory horns and lotus petal ridges:
        // alternating dark metal facets and tight spectral reflections.
        float hair=oval(p,vec2(0.450,0.362),vec2(0.169,0.174))
                  +oval(p,vec2(0.674,0.290),vec2(0.126,0.108));
        float horns=oval(p,vec2(0.924,0.192),vec2(0.067,0.069));
        float silver=(1.0-pink)*smoothstep(0.21,0.63,lum);
        float finish=clamp(hair*silver*0.9+horns*0.8+flowers*pink*0.7+river*caustic*0.15,0.0,1.0)*(1.0-face);
        float phase=p.x*3.2+p.y*4.9-t*0.21+seed*0.1;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        float sheen=pow(0.5+0.5*sin(phase*6.2831853),18.0);
        color*=1.0-finish*(0.10+0.12*(1.0-sheen));
        color+=(1.0-color)*mix(vec3(0.82,0.91,0.96),spectrum,0.65)*finish*(0.20+sheen*0.94);
        // A restrained full-art foil substrate keeps the edition recognizable
        // at listing size; the stronger, art-specific metal highlights remain above.
        vec3 finishHue = 0.5 + 0.5*cos(6.2831853*(p.x*1.4+p.y*0.9-t*0.12+seed*0.07+vec3(0.0,0.33,0.67)));
        vec3 finishOverlay = mix(2.0*color*finishHue,
            1.0-2.0*(1.0-color)*(1.0-finishHue),step(vec3(0.5),color));
        color = mix(color,finishOverlay,0.28);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
