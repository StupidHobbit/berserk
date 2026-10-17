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
    return 1.0-smoothstep(0.55,1.0,length((p-c)/r));
}
float segment(vec2 p,vec2 a,vec2 b) {
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.0,1.0));
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173)*6.283185;
    // Do not touch title, class line, cost/stamina badges or stat frames.
    float art=smoothstep(0.140,0.155,p.y)*(1.0-smoothstep(0.542,0.557,p.y));
    art*=smoothstep(0.024,0.045,p.x)*(1.0-smoothstep(0.950,0.975,p.x));
    art*=smoothstep(0.067,0.087,length((p-vec2(0.108,0.180))*vec2(1.0,1.4113)));
    vec3 color=scan.rgb;
    vec2 mouth=vec2(0.361,0.487);
    float cycle=fract(t*0.48+0.17+seed*0.025);
    float shot=exp(-cycle*25.0);
    float charge=pow(cycle,4.0);
    float barrel=oval(p,mouth,vec2(0.065,0.047));
    // A low amber ember builds in the dark bore, followed by a short shot.
    color+=barrel*vec3(0.55,0.23,0.025)*(charge*0.42+shot*1.35);
    float lens=oval(p,vec2(0.432,0.321),vec2(0.045,0.032));
    color+=lens*vec3(0.20,0.13,0.015)*(0.35+charge*0.65);
    float eye=oval(p,vec2(0.471,0.262),vec2(0.013,0.011));
    color+=eye*vec3(0.37,0.28,0.045)*(0.45+0.55*sin(t*2.8+seed)*sin(t*2.8+seed));

    // New powder smoke follows the existing pale curl out to the left;
    // expanding broken rings drift upward instead of flashing the whole art.
    float smoke=0.0;
    float smokeEdge=0.0;
    for(int i=0;i<7;i++) {
        float k=float(i);
        float f=fract(t*0.29+k/7.0+seed*0.021);
        vec2 c=mouth+vec2(-0.295*f,-0.103*f-0.029*sin(f*4.8));
        c.x+=0.012*sin(f*11.0+k*1.8);
        vec2 r=vec2(0.018+f*0.035,0.009+f*0.024);
        vec2 q=(p-c)/r;
        float angle=atan(q.y,q.x);
        float d=length(q);
        float curl=abs(d-(0.80+0.12*sin(angle*3.0+t*1.8+k)));
        float ring=1.0-smoothstep(0.11,0.29+aa/r.x,curl);
        float broken=0.35+0.65*smoothstep(-0.5,0.8,sin(angle+k*1.9-f*5.0));
        float fade=smoothstep(0.0,0.09,f)*(1.0-smoothstep(0.68,1.0,f));
        smoke+=ring*broken*fade*0.20;
        smokeEdge+=(1.0-smoothstep(0.01,0.13+aa/r.x,curl))*broken*fade*0.14;
    }
    color=mix(color,vec3(0.64,0.69,0.55),clamp(smoke,0.0,0.46));
    color+=smokeEdge*vec3(0.20,0.22,0.15);

    // Embers travel from the actual muzzle; one crooked ricochet evokes
    // Breng's dirty trick redirecting an attack, away from his face.
    for(int i=0;i<5;i++) {
        float k=float(i);
        float f=fract(t*0.62+k*0.211+seed*0.014);
        vec2 a=mouth+vec2(-0.20*f,-0.115*f)+vec2(0.0,sin(f*3.14)*0.018*(k-2.0));
        vec2 b=a+vec2(0.024,0.011)*(0.4+f);
        float d=segment(p,a,b);
        float streak=(1.0-smoothstep(0.0015,0.0035+aa*0.55,d));
        float fade=(1.0-smoothstep(0.65,1.0,f))*smoothstep(0.0,0.04,f);
        color+=vec3(0.57,0.29,0.045)*streak*fade*0.65;
    }
    float f=fract(t*0.38+0.31+seed*0.023);
    vec2 ricochet=mix(vec2(0.76,0.48),vec2(0.65,0.44),min(f*2.0,1.0));
    if(f>0.5) ricochet=mix(vec2(0.65,0.44),vec2(0.87,0.36),(f-0.5)*2.0);
    float spark=1.0-smoothstep(0.002,0.005+aa,length((p-ricochet)*vec2(1.0,1.4113)));
    color+=vec3(0.55,0.38,0.075)*spark*sin(f*3.14159);

    if(u_is_foil) {
        float bronze=smoothstep(0.03,0.22,scan.r-scan.b)*smoothstep(0.22,0.60,scan.r);
        float gun=oval(p,vec2(0.385,0.403),vec2(0.15,0.155));
        float leaf=oval(p,vec2(0.50,0.292),vec2(0.37,0.16));
        float phase=p.x*1.50+p.y*1.10+t*0.13+seed*0.10;
        vec3 hue=0.5+0.5*cos(6.283185*(phase+vec3(0.0,0.33,0.67)));
        vec3 coated=mix(2.0*color*hue,1.0-2.0*(1.0-color)*(1.0-hue),step(vec3(0.5),color));
        float finish=0.26+0.29*bronze*gun+0.12*leaf;
        color=mix(color,coated,finish);
        float shine=pow(0.5+0.5*sin(p.x*23.0-p.y*15.0-t*2.1+seed),14.0);
        color+=(1.0-color)*(vec3(0.19,0.13,0.035)+hue*0.36)*shine*(bronze*gun+leaf*0.35);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
