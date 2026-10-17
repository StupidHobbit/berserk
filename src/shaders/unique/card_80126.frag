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
    return 1.0-smoothstep(0.35,1.0,length((p-c)/r));
}
float segment(vec2 p,vec2 a,vec2 b) {
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/max(dot(v,v),0.000001),0.0,1.0));
}
vec2 venom(float s,float mouth) {
    vec2 a=vec2(0.116,0.345);
    vec2 b=vec2(0.207,0.392);
    vec2 c=vec2(0.141,0.443);
    if (mouth>0.5) {
        a=vec2(0.286,0.448); b=vec2(0.206,0.462); c=vec2(0.282,0.517);
    }
    if (mouth>1.5) {
        a=vec2(0.921,0.393); b=vec2(0.872,0.422); c=vec2(0.936,0.484);
    }
    vec2 q=(1.0-s)*(1.0-s)*a+2.0*s*(1.0-s)*b+s*s*c;
    q.x+=sin(s*12.0-mouth*1.9)*0.014*s;
    return q;
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=1.0/max(u_resolution.x,1.0);
    vec2 aspect=vec2(1.0,u_resolution.y/max(u_resolution.x,1.0));
    float seed=fract(u_seed*0.173);
    float t=u_time;
    // Strictly below the title and above all three stat plaques. The stacked
    // ability discs and the attached regeneration counter are fully excluded.
    float art=smoothstep(0.140,0.155,p.y)*(1.0-smoothstep(0.545,0.562,p.y));
    art*=smoothstep(0.013,0.031,p.x)*(1.0-smoothstep(0.965,0.986,p.x));
    art*=clamp(smoothstep(0.180,0.202,p.x)+smoothstep(0.307,0.325,p.y),0.0,1.0);
    if (art<=0.0) { gl_FragColor=scan; return; }
    vec3 color=scan.rgb;

    // Three independently staggered poison breaths follow the visible jaws.
    // Bright beads and longer soft green tails remain legible on small cards.
    float drops=0.0;
    float trails=0.0;
    float haze=0.0;
    for (int i=0;i<24;i++) {
        float fi=float(i);
        float mouth=floor(fi/8.0);
        float s=fract(t*0.36+fi*0.127+mouth*0.23+seed);
        vec2 c=venom(s,mouth);
        vec2 old=venom(max(s-0.11,0.0),mouth);
        float fade=smoothstep(0.0,0.08,s)*(1.0-smoothstep(0.76,1.0,s));
        float d=length((p-c)*aspect);
        float l=segment(p*aspect,old*aspect,c*aspect);
        drops+=(1.0-smoothstep(0.0025,0.006+aa*0.7,d))*fade;
        trails+=(1.0-smoothstep(0.002,0.005+aa,l))*fade;
        haze+=exp(-d*d/0.00048)*fade;
    }
    color=mix(color,vec3(0.13,0.32,0.022),clamp(haze*0.085,0.0,0.24));
    color+=(1.0-color)*vec3(0.43,0.83,0.075)*clamp(drops*0.80+trails*0.39,0.0,1.1);

    // Venom striking the shallow swamp sends actual moving elliptical rings.
    float ripples=0.0;
    for (int i=0;i<3;i++) {
        float fi=float(i);
        float age=fract(t*0.31+fi/3.0+seed);
        vec2 q=(p-vec2(0.418,0.508))*vec2(1.0,4.3);
        float d=abs(length(q)-(0.025+age*0.15));
        ripples+=(1.0-smoothstep(0.0015,0.004+aa,d))*(1.0-age)*smoothstep(0.0,0.10,age);
    }
    color+=vec3(0.16,0.36,0.09)*ripples;

    // Regeneration runs upward over the upright neck's real gold scales;
    // staggered eyes hint at the hydra's accumulating repeated attacks.
    float neck=oval(p,vec2(0.618,0.343),vec2(0.070,0.180));
    float gold=smoothstep(0.015,0.14,scan.r-scan.b)*smoothstep(0.10,0.40,scan.g);
    float wave=pow(0.5+0.5*sin(p.y*53.0+t*3.3+seed*6.283185),7.0);
    color+=(1.0-color)*vec3(0.32,0.55,0.055)*neck*gold*(0.13+0.50*wave);
    float eyes=oval(p,vec2(0.558,0.184),vec2(0.008,0.007))*(0.6+0.4*sin(t*3.0));
    eyes+=oval(p,vec2(0.197,0.319),vec2(0.012,0.005))*(0.6+0.4*sin(t*3.0+2.1));
    eyes+=oval(p,vec2(0.322,0.447),vec2(0.009,0.006))*(0.6+0.4*sin(t*3.0+4.2));
    color+=vec3(0.65,0.025,0.27)*eyes;

    if (u_is_foil) {
        // Saturated reptilian interference: broad emerald/copper/violet bands
        // already visible at t=0, with fine scale glints on the hydra itself.
        float phase=p.x*1.7+p.y*2.1-t*0.14+seed;
        vec3 spectrum=0.5+0.5*cos(6.283185*(phase+vec3(0.0,0.33,0.67)));
        vec3 coating=mix(2.0*color*spectrum,1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        color=mix(color,coating,0.40);
        float body=oval(p,vec2(0.610,0.421),vec2(0.32,0.14));
        body=max(body,neck);
        body=max(body,oval(p,vec2(0.352,0.306),vec2(0.22,0.065)));
        float luma=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
        float glint=pow(0.5+0.5*sin(p.x*44.0+p.y*68.0-t*1.9),9.0);
        color+=(1.0-color)*(vec3(0.10,0.17,0.025)+spectrum*0.35)*body*smoothstep(0.10,0.38,luma)*(0.30+0.70*glint);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
