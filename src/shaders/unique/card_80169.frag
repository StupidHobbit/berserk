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
    return 1.0-smoothstep(0.38,1.0,length((p-c)/r));
}
float lineDistance(vec2 p, vec2 a, vec2 b) {
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/max(dot(v,v),0.000001),0.0,1.0));
}
// Offerings climb the inside of each spread wing and enter the open jaws.
vec2 offering(float s, float side) {
    vec2 a=vec2(mix(0.10,0.91,side),0.505);
    vec2 b=vec2(mix(0.23,0.87,side),0.285);
    vec2 c=vec2(0.624,0.252);
    return (1.0-s)*(1.0-s)*a+2.0*(1.0-s)*s*b+s*s*c;
}

void main() {
    vec4 scan=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.1731)*6.2831853;
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    // The title ends at .137; stat ornaments begin below .54. No scan
    // coordinates are displaced, and every printed area retains exact pixels.
    float art=smoothstep(0.140,0.154,p.y)*(1.0-smoothstep(0.522,0.542,p.y));
    art*=smoothstep(0.008,0.026,p.x)*(1.0-smoothstep(0.974,0.992,p.x));
    if (art<=0.0) { gl_FragColor=scan; return; }
    vec3 color=scan.rgb;
    float lum=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
    float wings=clamp(oval(p,vec2(0.13,0.233),vec2(0.235,0.133))+
                      oval(p,vec2(0.872,0.235),vec2(0.226,0.130)),0.0,1.0);
    float red=smoothstep(0.045,0.24,scan.r-max(scan.g,scan.b));
    float membrane=wings*red;
    // Blood pressure visibly travels outward through the existing scarlet
    // membranes. Printed black wing veins remain sharply legible.
    float spread=abs(p.x-0.51)+0.60*(0.31-p.y);
    float beat=0.5+0.5*sin(spread*34.0-t*4.3+seed);
    float blood=pow(beat,5.0)*membrane;
    color*=1.0-0.20*membrane*(1.0-beat);
    color+=(1.0-color)*vec3(0.64,0.13,0.025)*blood*0.62;

    float drops=0.0;
    float trails=0.0;
    float haze=0.0;
    for (int i=0;i<18;i++) {
        float fi=float(i);
        float side=mod(fi,2.0);
        float age=fract(t*0.24+fi*0.137+seed*0.043);
        vec2 c=offering(age,side);
        vec2 b=offering(max(0.0,age-0.055),side);
        float flutter=sin(age*15.0+fi*1.7+seed)*0.011*(1.0-age);
        c.x+=flutter;
        b.x+=flutter;
        float life=smoothstep(0.0,0.12,age)*(1.0-smoothstep(0.91,1.0,age));
        float d=length((p-c)*vec2(1.0,1.4113));
        float dl=lineDistance(p*vec2(1.0,1.4113),b*vec2(1.0,1.4113),c*vec2(1.0,1.4113));
        drops+=(1.0-smoothstep(0.0035,0.0065+aa*0.55,d))*life;
        trails+=(1.0-smoothstep(0.0011,0.0030+aa*0.45,dl))*life;
        haze+=exp(-d*d/0.00055)*life;
    }
    color*=1.0-min(haze,1.0)*0.12;
    color+=vec3(0.43,0.025,0.043)*min(haze,1.3)*0.33;
    color=mix(color,vec3(0.78,0.035,0.075),clamp(trails*0.58,0.0,0.75));
    color+=vec3(0.60,0.20,0.085)*min(drops,1.3);

    // Existing blue chest channels answer the vampiric offering with a
    // descending pulse; the painted eye and mouth have compact focal glows.
    float chest=oval(p,vec2(0.512,0.436),vec2(0.173,0.116));
    float blue=smoothstep(0.025,0.20,scan.b-scan.r*0.85)*chest;
    float flow=pow(0.5+0.5*sin(p.y*88.0-t*4.9+seed),4.0);
    color+=vec3(0.035,0.30,0.48)*blue*(0.18+0.82*flow);
    float eye=oval(p,vec2(0.600,0.221),vec2(0.015,0.009));
    float jaws=oval(p,vec2(0.625,0.251),vec2(0.027,0.023));
    float heartbeat=0.45+0.55*pow(0.5+0.5*sin(t*3.1+seed),3.0);
    color+=vec3(0.16,0.60,0.69)*eye*(0.45+heartbeat);
    color+=vec3(0.48,0.025,0.05)*jaws*heartbeat;

    if (u_is_foil) {
        // Static copper/ruby wing laminates and cyan/gold scale facets also
        // identify the foil edition when animation is reduced to t=0.
        float body=oval(p,vec2(0.555,0.358),vec2(0.205,0.228));
        float phase=p.x*2.3+p.y*3.4-t*0.12+seed*0.04;
        vec3 iridescence=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        vec3 copper=mix(vec3(0.94,0.21,0.035),vec3(0.86,0.57,0.13),0.5+0.5*sin(phase*6.2831853));
        float band=pow(0.5+0.5*sin(p.x*18.0-p.y*15.0-t*0.85+seed),7.0);
        float metal=clamp(membrane*0.9+body*smoothstep(0.035,0.20,lum),0.0,1.0);
        vec3 hue=mix(iridescence,copper,membrane);
        color*=1.0-metal*0.16;
        color+=(1.0-color)*hue*metal*(0.29+0.52*band);
        color+=vec3(0.035,0.24,0.28)*blue*0.40;
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
