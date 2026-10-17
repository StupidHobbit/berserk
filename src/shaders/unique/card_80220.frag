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

float hash(float x) { return fract(sin(x*127.1+31.7)*43758.5453); }
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.35,1.0,length((p-c)/r));
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=1.0/max(u_resolution.y,1.0);
    float ax=1.0/max(u_resolution.x,1.0);
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.137);
    // Everything printed, including the class ribbon and upper stat blades,
    // stays byte-for-byte sampled from the scan outside this illustration.
    float art=smoothstep(0.140,0.153,p.y)*(1.0-smoothstep(0.536,0.548,p.y));
    art*=smoothstep(0.009,0.022,p.x)*(1.0-smoothstep(0.978,0.993,p.x));
    if(art<=0.0) { gl_FragColor=scan; return; }
    vec3 color=scan.rgb;
    float face=oval(p,vec2(0.629,0.205),vec2(0.105,0.091));
    float cannon=oval(p,vec2(0.285,0.354),vec2(0.265,0.110));
    float flameZone=oval(p,vec2(0.138,0.492),vec2(0.125,0.065));
    float flicker=0.55+0.22*sin(t*7.2+seed*6.28)+0.16*sin(t*13.1+2.8);
    color+=vec3(0.24,0.072,0.006)*flameZone*flicker;
    color+=vec3(0.095,0.033,0.003)*cannon*flicker;

    // The lit match at lower left throws long, distinct wind-bent tongues.
    // They grow from the painted flame, never crossing the stat frame.
    float flame=0.0;
    float core=0.0;
    for(int i=0;i<8;i++) {
        float k=float(i);
        float h=0.030+0.035*(0.5+0.5*sin(t*4.0+k*1.71+seed*6.28));
        float by=0.518-k*0.006;
        float rise=(by-p.y)/h;
        float bend=0.012*sin(rise*5.5-t*5.6+k)+0.019*rise;
        float cx=0.059+k*0.017+bend;
        float width=0.007*(1.0-clamp(rise,0.0,1.0))+0.001;
        float taper=smoothstep(0.0,0.15,rise)*(1.0-smoothstep(0.70,1.0,rise));
        float d=abs(p.x-cx);
        flame=max(flame,(1.0-smoothstep(width,width+ax*0.8,d))*taper);
        core=max(core,(1.0-smoothstep(width*0.25,width*0.65+ax*0.35,d))*taper);
    }
    color=mix(color,vec3(1.0,0.265,0.018),flame*0.77);
    color+=vec3(0.18,0.40,0.045)*core;

    // Burning fragments lift away from the match; their staggered origins
    // leave readable moving orange dashes even in the compact card list.
    float embers=0.0;
    float halos=0.0;
    for(int i=0;i<20;i++) {
        float k=float(i);
        float age=fract(t*(0.42+hash(k+5.0)*0.22)+hash(k+13.0)+seed);
        vec2 c=vec2(0.055+0.15*hash(k+4.0),0.512-0.033*hash(k+17.0));
        c+=vec2(0.038*age+0.011*sin(age*8.0+k),-age*(0.10+0.09*hash(k+8.0)));
        float fade=smoothstep(0.0,0.10,age)*(1.0-smoothstep(0.63,1.0,age));
        vec2 q=(p-c)/vec2(0.0026+ax*0.6,0.005+aa*0.65);
        float d=length(q);
        embers+=(1.0-smoothstep(0.1,1.0,d))*fade;
        halos+=exp(-d*1.1)*fade;
    }
    color+=vec3(1.0,0.47,0.045)*embers+vec3(0.17,0.038,0.003)*halos;

    // A slow shot cycle: hot muzzle rim, then cool powder smoke curls
    // upwards along the exposed left edge of the ship's cannon.
    float cycle=fract(t*0.29+seed*0.25+0.12);
    float shot=exp(-cycle*23.0);
    vec2 muzzle=(p-vec2(0.077,0.343))/vec2(0.038,0.079);
    float rim=1.0-smoothstep(0.10,0.24+aa*5.0,abs(length(muzzle)-0.9));
    color+=vec3(0.95,0.32,0.026)*rim*shot;
    color+=vec3(0.22,0.070,0.004)*cannon*shot;
    float smoke=0.0;
    for(int i=0;i<7;i++) {
        float k=float(i);
        float age=fract(cycle+k*0.105);
        vec2 c=vec2(0.062-0.024*age+0.020*sin(age*7.0+k*0.7),0.335-age*0.155);
        vec2 size=vec2(0.014+age*0.046,0.014+age*0.026);
        float puff=oval(p,c,size);
        float curl=0.72+0.28*sin(p.x*155.0+p.y*100.0-t*2.8+k);
        smoke+=puff*curl*sin(age*3.141593)*0.19;
    }
    color=mix(color,vec3(0.34,0.47,0.45),clamp(smoke,0.0,0.52));

    if(u_is_foil) {
        // Broad copper and petrol interference stays plainly visible at t=0.
        // Keep the face natural, and retain the scan's dark metal texture.
        float gear=oval(p,vec2(0.713,0.417),vec2(0.225,0.157));
        float sea=smoothstep(0.025,0.18,scan.b-scan.r);
        float metal=max(cannon,gear*0.78)*(1.0-face);
        float finish=clamp(metal+sea*0.55,0.0,1.0)*(1.0-face*0.9);
        float phase=p.x*1.9+p.y*3.1+0.14*sin(p.y*17.0)-t*0.12+seed*0.4;
        vec3 spectrum=0.5+0.5*cos(6.283185*(phase+vec3(0.0,0.333,0.667)));
        vec3 tint=mix(vec3(0.94,0.51,0.14),spectrum,0.77);
        float band=pow(0.5+0.5*sin(phase*6.283185),5.0);
        color*=1.0-finish*0.12;
        color+=(1.0-color)*tint*finish*(0.30+band*0.45);
        color+=spectrum*rim*(0.19+shot*0.22);
        color+=vec3(0.18,0.085,0.015)*core;
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
