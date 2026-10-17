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

float oval(vec2 p,vec2 c,vec2 r) {
    return 1.0-smoothstep(0.42,1.0,length((p-c)/r));
}
float segment(vec2 p,vec2 a,vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/max(dot(d,d),0.000001),0.0,1.0));
}
vec2 tongue(float s,float t) {
    return vec2(0.655+0.253*s,0.292-0.095*s-0.027*sin(s*3.141593))
        +vec2(0.0,0.006*sin(s*8.0-t*5.0)*s);
}
void main() {
    vec4 scan=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec2 aspect=vec2(1.0,1.4113);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.137);
    // Top-left scan coordinates: stop before the moss and statistic plaques.
    float art=smoothstep(0.140,0.153,p.y)*(1.0-smoothstep(0.539,0.557,p.y));
    art*=smoothstep(0.012,0.029,p.x)*(1.0-smoothstep(0.971,0.990,p.x));
    // Protection icon and its attached one-counter are untouched.
    art*=clamp(smoothstep(0.185,0.207,p.x)+smoothstep(0.232,0.249,p.y),0.0,1.0);
    if (art<=0.0) { gl_FragColor=scan; return; }
    vec3 col=scan.rgb;

    // Surfacing aquatic warrior: large rising bubbles hug the two shoulders.
    float bubbles=0.0;
    float gleams=0.0;
    for (int i=0;i<14;i++) {
        float fi=float(i);
        float side=mod(fi,2.0)*2.0-1.0;
        float h=fract(sin(fi*47.3+seed*17.0)*4731.7);
        float age=fract(t*(0.19+h*0.12)+fi*0.171+seed);
        vec2 c=vec2(0.51+side*(0.35+h*0.08)+0.015*sin(age*9.0+fi),0.55-age*0.39);
        float radius=0.006+h*0.009+age*0.003;
        vec2 q=(p-c)*aspect;
        float fade=smoothstep(0.0,0.10,age)*(1.0-smoothstep(0.83,1.0,age));
        bubbles+=(1.0-smoothstep(0.001,0.0025+aa*0.5,abs(length(q)-radius)))*fade;
        gleams+=(1.0-smoothstep(0.001,0.003+aa*0.5,length(q-vec2(-0.004,-0.005))))*fade;
    }
    col+=(1.0-col)*vec3(0.12,0.66,0.83)*min(bubbles*0.76,0.85);
    col+=(1.0-col)*vec3(0.50,0.83,0.91)*min(gleams*0.85,0.85);

    // A fast tongue lash rises from the painted right corner of the mouth.
    // It extends, holds briefly, then reels a target back down from the air.
    float cycle=fract(t*0.27+0.14+seed*0.10);
    float reach=smoothstep(0.08,0.25,cycle)*(1.0-smoothstep(0.35,0.57,cycle));
    float lash=0.0;
    float core=0.0;
    for (int i=0;i<20;i++) {
        float s=float(i)/20.0;
        vec2 a=tongue(s*reach,t);
        vec2 b=tongue((s+0.05)*reach,t);
        float d=segment(p*aspect,a*aspect,b*aspect);
        float width=0.005*(1.0-s*0.6);
        float visible=smoothstep(0.02,0.10,reach);
        lash=max(lash,(1.0-smoothstep(width,width+aa*0.7,d))*visible);
        core=max(core,(1.0-smoothstep(0.0006,0.0016+aa*0.4,d))*visible);
    }
    col=mix(col,vec3(0.48,0.145,0.065),lash*0.88);
    col+=(1.0-col)*vec3(0.95,0.54,0.16)*core*0.86;

    // Cold energy runs down the actual blue blade, from tip to broad base.
    float blade=oval(p,vec2(0.325,0.423),vec2(0.285,0.174));
    blade*=smoothstep(0.035,0.19,scan.b-scan.r)*smoothstep(0.20,0.47,scan.b);
    float band=fract(p.y*2.8+p.x*0.62-t*0.48+seed);
    float sweep=1.0-smoothstep(0.035,0.12,abs(band-0.5));
    float frost=pow(0.5+0.5*sin(p.x*82.0+p.y*37.0-t*3.0),8.0);
    col*=1.0-blade*0.10;
    col+=(1.0-col)*vec3(0.20,0.72,0.95)*blade*(0.13+0.78*sweep+0.13*frost);
    // Water-caustic contours crawl over the frog's warty head and forearm.
    float skin=oval(p,vec2(0.52,0.233),vec2(0.32,0.105));
    skin=max(skin,oval(p,vec2(0.74,0.427),vec2(0.22,0.13)));
    float ripple=pow(0.5+0.5*sin(p.y*88.0+sin(p.x*24.0+t*1.5)*2.4-t*3.8),14.0);
    col+=(1.0-col)*vec3(0.13,0.37,0.56)*skin*ripple*0.49;

    if (u_is_foil) {
        // A broad interference coating reads even in a frozen compact card.
        float phase=p.x*1.6-p.y*2.8+seed*0.3-t*0.10;
        vec3 hue=0.5+0.5*cos(6.283185*(phase+vec3(0.05,0.37,0.69)));
        vec3 overlay=mix(2.0*col*hue,1.0-2.0*(1.0-col)*(1.0-hue),step(vec3(0.5),col));
        col=mix(col,overlay,0.42);
        float gold=oval(p,vec2(0.54,0.345),vec2(0.22,0.085));
        gold=max(gold,oval(p,vec2(0.82,0.433),vec2(0.11,0.068)));
        float metal=max(blade,gold*smoothstep(0.04,0.20,scan.r-scan.b));
        float shine=pow(0.5+0.5*sin(phase*6.283185+p.y*12.0),10.0);
        col+=(1.0-col)*(0.18+0.50*hue)*metal*(0.30+0.70*shine);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(col,0.0,1.0),art),scan.a);
}
