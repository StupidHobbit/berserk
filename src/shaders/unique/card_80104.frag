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
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/max(dot(d,d),0.00001),0.0,1.0));
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173)*6.2831853;
    // Both printed defensive badges and their rims are outside the effect.
    float art=smoothstep(0.145,0.158,p.y)*(1.0-smoothstep(0.539,0.555,p.y));
    art*=smoothstep(0.025,0.044,p.x)*(1.0-smoothstep(0.959,0.979,p.x));
    art*=smoothstep(0.059,0.074,length((p-vec2(0.108,0.180))*vec2(1.0,1.4113)));
    art*=smoothstep(0.066,0.083,length((p-vec2(0.111,0.269))*vec2(1.0,1.4113)));
    vec3 color=scan.rgb;
    vec2 hand=vec2(0.318,0.195);
    vec2 metric=vec2(1.0,1.4113);

    // The raised palm catches an incoming cyan spell; a gold copy returns
    // along a separate bowed trajectory, matching his spell reflection rule.
    float blue=0.0;
    float gold=0.0;
    float halo=0.0;
    for(int i=0;i<12;i++) {
        float k=float(i);
        float f=fract(t*0.42+k/12.0+seed*0.025);
        float back=max(0.0,f-0.047);
        vec2 a=mix(vec2(0.931,0.386),hand,f);
        vec2 b=mix(vec2(0.931,0.386),hand,back);
        a.y-=sin(f*3.141593)*0.053;
        b.y-=sin(back*3.141593)*0.053;
        float d=segment(p*metric,a*metric,b*metric);
        float envelope=smoothstep(0.0,0.10,f)*(1.0-smoothstep(0.89,1.0,f));
        float packet=0.30+0.70*pow(0.5+0.5*sin(k*1.8-t*2.3),2.0);
        blue+=(1.0-smoothstep(0.0015,0.005+aa*0.55,d))*envelope*packet;
        halo+=exp(-d/0.014)*envelope*packet;
        float g=fract(t*0.52+k/12.0+0.4+seed*0.025);
        float gb=max(0.0,g-0.052);
        vec2 c=mix(hand,vec2(0.939,0.204),g);
        vec2 e=mix(hand,vec2(0.939,0.204),gb);
        c.y+=sin(g*3.141593)*0.047;
        e.y+=sin(gb*3.141593)*0.047;
        float dg=segment(p*metric,c*metric,e*metric);
        float env=smoothstep(0.0,0.08,g)*(1.0-smoothstep(0.83,1.0,g));
        gold+=(1.0-smoothstep(0.0014,0.0048+aa*0.55,dg))*env*packet;
    }
    // Preserve facial detail underneath the reflected streams.
    float face=oval(p,vec2(0.513,0.302),vec2(0.073,0.072));
    color+=vec3(0.025,0.24,0.36)*min(blue,1.5)*(1.0-face*0.92);
    color+=vec3(0.37,0.21,0.018)*min(gold,1.5)*(1.0-face*0.92);
    color+=vec3(0.0,0.022,0.036)*min(halo,2.0)*(1.0-face);

    // Three moving broken ward rings emerge from the painted flare.
    vec2 q=(p-hand)*metric;
    float angle=atan(q.y,q.x);
    float radius=length(q);
    float wards=0.0;
    for(int i=0;i<3;i++) {
        float k=float(i);
        float phase=fract(t*0.33+k/3.0+seed*0.03);
        float r=0.032+phase*0.156;
        float ring=1.0-smoothstep(0.0018,0.005+aa*0.5,abs(radius-r));
        float broken=smoothstep(-0.25,0.25,sin(angle*3.0-t*2.2+k*2.0));
        wards+=ring*broken*sin(phase*3.141593);
    }
    color+=vec3(0.32,0.21,0.045)*wards;
    float palm=oval(p,hand,vec2(0.074,0.060));
    color+=vec3(0.14,0.063,0.004)*palm*(0.45+0.55*sin(t*5.4+seed));

    // Wind follows the crouched forest guardian's lower silhouette.
    float wind=0.0;
    for(int i=0;i<7;i++) {
        float k=float(i);
        float f=fract(t*(0.13+k*0.008)+k*0.618034+seed*0.03);
        vec2 c=vec2(0.11+f*0.79,0.485-0.055*sin(f*4.0+k*1.7));
        vec2 tail=c-vec2(0.035,0.009*cos(f*4.0+k*1.7));
        float d=segment(p*metric,c*metric,tail*metric);
        float fade=smoothstep(0.0,0.15,f)*(1.0-smoothstep(0.80,1.0,f));
        wind+=(1.0-smoothstep(0.0015,0.004+aa*0.48,d))*fade;
    }
    color+=vec3(0.025,0.12,0.14)*wind;

    if(u_is_foil) {
        // Broad copper/emerald/violet bands are visible even at frozen t=0.
        vec3 spectrum=0.5+0.5*cos(6.2831853*(p.x*1.52+p.y*1.12-t*0.10+seed*0.035+vec3(0.0,0.33,0.67)));
        float mantle=oval(p,vec2(0.528,0.323),vec2(0.362,0.175));
        vec3 metal=mix(2.0*color*spectrum,1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        color=mix(color,metal,(0.30+0.23*mantle)*(1.0-face*0.75));
        float foilArc=pow(0.5+0.5*sin(radius*61.0-angle*1.8-t*1.8+seed),12.0);
        color+=(1.0-color)*spectrum*foilArc*0.31*(1.0-face*0.85);
        color+=vec3(0.16,0.09,0.02)*wards;
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
