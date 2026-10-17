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
    return 1.0-smoothstep(0.40,1.0,length((p-c)/r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/max(dot(d,d),0.000001),0.0,1.0));
}
vec2 wisp(float s, float side, float t) {
    float x=mix(0.34,0.65,side);
    x+=(side*2.0-1.0)*(0.018+0.053*s);
    x+=0.026*sin(s*9.0-t*2.7+side*2.8)*s;
    return vec2(x,0.277+s*0.267);
}
void main() {
    vec4 scan=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec2 aspect=vec2(1.0,1.4113);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173);
    // Safely below the class label; above every hand, statistic and scroll.
    float art=smoothstep(0.138,0.151,p.y)*(1.0-smoothstep(0.527,0.540,p.y));
    art*=smoothstep(0.015,0.032,p.x)*(1.0-smoothstep(0.967,0.985,p.x));
    // The printed protection medallion is part of the scan, never the effect.
    art*=smoothstep(0.063,0.079,length((p-vec2(0.109,0.180))*aspect));
    if (art<=0.0) { gl_FragColor=scan; return; }
    vec3 col=scan.rgb;

    // Two substantial translucent tails separate from the incorporeal warrior.
    float veil=0.0;
    float edge=0.0;
    for (int i=0;i<24;i++) {
        float s=float(i)/24.0;
        vec2 a=wisp(s,0.0,t);
        vec2 b=wisp(s+1.0/24.0,0.0,t);
        vec2 c=wisp(s,1.0,t);
        vec2 d=wisp(s+1.0/24.0,1.0,t);
        float dist=min(segment(p*aspect,a*aspect,b*aspect),segment(p*aspect,c*aspect,d*aspect));
        float fade=smoothstep(0.0,0.12,s)*(1.0-smoothstep(0.76,1.0,s));
        float flow=0.30+0.70*pow(0.5+0.5*sin(s*13.0-t*5.2+seed*6.28),3.0);
        veil=max(veil,(1.0-smoothstep(0.009,0.036,dist))*fade*flow);
        edge=max(edge,(1.0-smoothstep(0.0025,0.005+aa*0.65,dist))*fade*flow);
    }
    col=mix(col,col*vec3(0.47,0.90,1.08)+vec3(0.015,0.10,0.18),veil*0.72);
    col+=(1.0-col)*vec3(0.20,0.82,1.0)*edge*0.86;

    // A bright charge climbs the painted raised sword, then disperses.
    vec2 tip=vec2(0.317,0.139);
    vec2 hilt=vec2(0.386,0.218);
    float blade=segment(p*aspect,tip*aspect,hilt*aspect);
    float sword=1.0-smoothstep(0.004,0.012+aa*0.4,blade);
    float packet=fract(t*0.57+seed);
    vec2 charge=mix(hilt,tip,packet);
    float pulse=exp(-dot((p-charge)*aspect,(p-charge)*aspect)*1700.0);
    col+=(1.0-col)*vec3(0.22,0.75,1.0)*sword*(0.25+0.75*pulse);

    // Stasis radiates from the shield's embossed boss as broken cold rings.
    vec2 q=(p-vec2(0.588,0.462))*vec2(1.0,1.75);
    float radius=length(q);
    float angle=atan(q.y,q.x);
    float phase=fract(t*0.46+seed*0.24);
    float ringRadius=0.032+phase*0.21;
    float ring=(1.0-smoothstep(0.0035,0.008+aa*0.45,abs(radius-ringRadius)));
    ring*=smoothstep(0.02,0.16,phase)*(1.0-smoothstep(0.65,1.0,phase));
    ring*=0.35+0.65*smoothstep(-0.3,0.4,sin(angle*5.0-t*2.2));
    col+=(1.0-col)*vec3(0.23,0.60,1.0)*ring*0.75;

    // Blue spirit motes drift upwards from the cloak, large enough in a list.
    float motes=0.0;
    for (int i=0;i<12;i++) {
        float fi=float(i);
        float h=fract(sin(fi*38.73+seed*9.0)*2741.3);
        float age=fract(t*(0.23+h*0.12)+fi*0.169+seed);
        float side=mod(fi,2.0)*2.0-1.0;
        vec2 c=vec2(0.49+side*(0.17+h*0.06)+0.025*sin(age*8.0+fi),0.545-age*0.30);
        vec2 v=(p-c)*aspect;
        float fade=smoothstep(0.0,0.12,age)*(1.0-smoothstep(0.75,1.0,age));
        float d=length(v/vec2(1.0,2.4));
        motes+=(1.0-smoothstep(0.002,0.005+aa*0.35,d))*fade;
    }
    col+=(1.0-col)*vec3(0.29,0.73,1.0)*min(motes,0.9);

    if (u_is_foil) {
        // Cold spectral steel carries a saturated interference coat even at t=0.
        float phaseFoil=p.x*1.9+p.y*2.4+seed*0.22-t*0.12;
        vec3 hue=0.5+0.5*cos(6.283185*(phaseFoil+vec3(0.03,0.37,0.67)));
        vec3 overlay=mix(2.0*col*hue,1.0-2.0*(1.0-col)*(1.0-hue),step(vec3(0.5),col));
        col=mix(col,overlay,0.52);
        float steel=oval(p,vec2(0.49,0.365),vec2(0.23,0.22));
        steel=max(steel,oval(p,vec2(0.616,0.453),vec2(0.12,0.14)));
        steel*=smoothstep(0.08,0.32,scan.b)*smoothstep(0.01,0.14,scan.b-scan.r);
        float bands=pow(0.5+0.5*sin(phaseFoil*6.283185+p.y*14.0),7.0);
        col+=(1.0-col)*(vec3(0.13,0.25,0.38)+hue*0.55)*steel*(0.35+0.65*bands);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(col,0.0,1.0),art),scan.a);
}
