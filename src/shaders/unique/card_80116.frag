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

// Ishar's poisonous quagmires: three doses spread in the painted pools,
// while venom bubbles and rising vapour reveal the otherwise still marsh.
float pool(vec2 p,vec2 c,vec2 size) {
    return 1.0-smoothstep(0.55,1.0,length((p-c)/size));
}
vec2 source(float n) {
    if(n<0.5) return vec2(0.225,0.475);
    if(n<1.5) return vec2(0.715,0.474);
    if(n<2.5) return vec2(0.599,0.337);
    if(n<3.5) return vec2(0.182,0.366);
    return vec2(0.718,0.421);
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=1.0/max(u_resolution.x,1.0);
    float seed=fract(u_seed*0.1193);
    float t=u_time;
    // The lower heraldic shields begin below this boundary. Every printed
    // pixel, including the upper cost and swamp emblem, remains untouched.
    float art=smoothstep(0.145,0.157,p.y)*(1.0-smoothstep(0.538,0.552,p.y));
    art*=smoothstep(0.005,0.019,p.x)*(1.0-smoothstep(0.981,0.995,p.x));
    if(art<=0.0) { gl_FragColor=scan; return; }
    vec3 color=scan.rgb;
    float water=smoothstep(0.035,0.15,scan.b-scan.r)*smoothstep(0.05,0.24,scan.g);
    water*=smoothstep(0.270,0.310,p.y);
    float ripples=0.0;
    float venom=0.0;
    for(int i=0;i<15;i++) {
        float f=float(i);
        float basin=floor(f/3.0);
        float dose=mod(f,3.0);
        vec2 c=source(basin);
        float cycle=fract(t*0.32+dose/3.0+basin*0.139+seed);
        vec2 q=(p-c)*vec2(1.0,3.2);
        float radius=0.012+cycle*0.115;
        float fade=(1.0-smoothstep(0.62,1.0,cycle))*smoothstep(0.0,0.09,cycle);
        float d=abs(length(q)-radius);
        ripples+=(1.0-smoothstep(0.0018,0.004+aa*0.8,d))*fade;
        venom+=pool(p,c,vec2(0.075,0.023))*(0.35+0.25*sin(t*2.0+basin*1.7));
    }
    color+=vec3(0.18,0.48,0.015)*ripples*(0.26+0.74*water);
    color=mix(color,color*vec3(0.64,1.12,0.70)+vec3(0.045,0.09,0.0),clamp(venom*water,0.0,0.65));

    // Vapour drifts upward from the pale, painted marsh-fume columns.
    float mist=0.0;
    for(int i=0;i<4;i++) {
        float fi=float(i);
        float x=0.29+fi*0.18;
        float base=0.530-fi*0.009;
        float rise=clamp((base-p.y)/0.12,0.0,1.0);
        float center=x+0.024*sin(rise*9.0-t*1.8+fi*2.1)+0.016*sin(rise*18.0+t);
        float width=0.008+rise*0.015;
        float plume=exp(-pow((p.x-center)/width,2.0));
        float ends=smoothstep(base-0.125,base-0.10,p.y)*(1.0-smoothstep(base-0.012,base+0.003,p.y));
        mist+=plume*ends*(0.5+0.5*sin(rise*15.0-t*3.1+fi));
    }
    color=mix(color,vec3(0.30,0.62,0.13),min(mist*0.48,0.52));
    // Large enough to read as poisonous rising bubbles in the compact list.
    for(int i=0;i<16;i++) {
        float fi=float(i);
        float age=fract(t*(0.21+0.04*fract(fi*0.31))+fi*0.173+seed);
        vec2 c=source(mod(fi,5.0));
        c.x+=0.044*sin(fi*2.4)+0.015*sin(age*7.0+fi);
        c.y-=age*(0.055+0.025*fract(fi*0.73));
        vec2 q=(p-c)*vec2(1.0,u_resolution.y/max(u_resolution.x,1.0));
        float radius=0.004+0.003*fract(fi*0.618);
        float d=length(q);
        float bubble=(1.0-smoothstep(radius,radius+aa*0.8,d));
        float core=1.0-smoothstep(radius*0.15,radius*0.65,d);
        float fade=smoothstep(0.0,0.1,age)*(1.0-smoothstep(0.72,1.0,age));
        color+=(vec3(0.36,0.62,0.045)*bubble-vec3(0.20,0.28,0.02)*core)*fade;
    }
    if(u_is_foil) {
        // Oil-like interference belongs to the marsh water and cloud strata;
        // the spatial colour bands are already strong at reduced-motion t=0.
        float phase=p.x*2.1+p.y*5.8+0.24*sin(p.x*13.0+p.y*9.0)-t*0.15+seed;
        vec3 rainbow=0.5+0.5*cos(6.283185*(phase+vec3(0.0,0.33,0.67)));
        vec3 metal=mix(2.0*color*rainbow,1.0-2.0*(1.0-color)*(1.0-rainbow),step(vec3(0.5),color));
        color=mix(color,metal,0.40+0.18*water);
        float sheen=pow(0.5+0.5*sin(phase*6.283185),9.0);
        color+=(1.0-color)*rainbow*(0.07+0.31*sheen)*(0.35+0.65*water);
        color+=vec3(0.18,0.12,0.35)*ripples*0.4;
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
