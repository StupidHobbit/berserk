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
    return 1.0-smoothstep(0.25,1.0,length((p-c)/r));
}
float segment(vec2 p,vec2 a,vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/max(dot(d,d),0.000001),0.0,1.0));
}
void main() {
    vec4 scan=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec2 asp=vec2(1.0,u_resolution.y/max(u_resolution.x,1.0));
    float aa=1.0/max(u_resolution.x,1.0);
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173);
    // Clear the title, shield and all three lower stat frames completely.
    float art=smoothstep(0.140,0.157,p.y)*(1.0-smoothstep(0.537,0.553,p.y));
    art*=smoothstep(0.010,0.027,p.x)*(1.0-smoothstep(0.970,0.989,p.x));
    art*=smoothstep(1.0,1.18,length((p-vec2(0.108,0.182))/vec2(0.064,0.044)));
    if (art<=0.0) { gl_FragColor=scan; return; }
    vec3 col=scan.rgb;

    // The seahorse's ascent pulls two winding columns of bubbles past its
    // tail and muzzle. Rings and short wakes remain legible on a small card.
    float bubbles=0.0;
    float wakes=0.0;
    for (int i=0;i<18;i++) {
        float fi=float(i);
        float side=mod(fi,2.0);
        float h=fract(sin(fi*29.41+seed*8.0)*1357.3);
        float age=fract(t*(0.19+h*0.10)+fi*0.143+seed);
        float y=0.535-age*0.39;
        float x=mix(0.075,0.927,side)+0.024*sin(y*35.0+t*1.9+fi)+h*0.025;
        vec2 c=vec2(x,y);
        float r=0.004+h*0.008;
        float fade=smoothstep(0.0,0.12,age)*(1.0-smoothstep(0.83,1.0,age));
        float d=length((p-c)*asp);
        bubbles+=(1.0-smoothstep(0.0007,0.0021+aa*0.40,abs(d-r)))*fade;
        float wd=segment(p*asp,(c+vec2(0.0,0.012))*asp,(c+vec2(0.003,0.027))*asp);
        wakes+=(1.0-smoothstep(0.0008,0.002+aa*0.35,wd))*fade;
    }
    col+=(1.0-col)*vec3(0.17,0.76,0.88)*min(bubbles*0.82+wakes*0.31,0.92);

    // Gold charge climbs the real staff when an aquanite surfaces.
    vec2 staffA=vec2(0.373,0.532);
    vec2 staffB=vec2(0.228,0.226);
    vec2 staff=staffB-staffA;
    float along=clamp(dot(p-staffA,staff)/dot(staff,staff),0.0,1.0);
    float sd=segment(p*asp,staffA*asp,staffB*asp);
    float packet=pow(0.5+0.5*cos(along*18.85-t*5.3+seed*6.28),9.0);
    float shaft=(1.0-smoothstep(0.002,0.006+aa*0.45,sd));
    col+=(1.0-col)*vec3(0.90,0.58,0.12)*shaft*(0.14+0.79*packet);
    float crown=oval(p,vec2(0.228,0.184),vec2(0.049,0.047));
    col+=(1.0-col)*vec3(0.17,0.65,0.74)*crown*(0.17+0.32*sin(t*2.65)*sin(t*2.65));

    // Three spectral tridents shoot from the painted weapon across the
    // upper water, explicitly echoing its three ranged attacks per turn.
    float missiles=0.0;
    float trails=0.0;
    for (int j=0;j<3;j++) {
        float age=fract(t*0.27+float(j)/3.0+seed);
        vec2 head=vec2(0.255+age*0.64,0.181+0.019*sin(age*3.14159));
        float fade=smoothstep(0.0,0.10,age)*(1.0-smoothstep(0.76,1.0,age));
        float d=segment(p*asp,(head-vec2(0.052,0.0))*asp,head*asp);
        d=min(d,segment(p*asp,(head-vec2(0.023,0.0))*asp,(head+vec2(-0.006,-0.010))*asp));
        d=min(d,segment(p*asp,(head-vec2(0.023,0.0))*asp,(head+vec2(-0.006,0.010))*asp));
        missiles+=(1.0-smoothstep(0.001,0.003+aa*0.35,d))*fade;
        float td=segment(p*asp,(head-vec2(0.12,0.0))*asp,(head-vec2(0.04,0.0))*asp);
        trails+=(1.0-smoothstep(0.002,0.006+aa*0.45,td))*fade;
    }
    col+=(1.0-col)*vec3(0.22,0.83,0.91)*min(missiles*0.92+trails*0.28,0.95);

    // Flowing caustic ridges follow the curled blue mount, leaving the
    // rider's face and red armor readable.
    float mount=oval(p,vec2(0.772,0.283),vec2(0.170,0.136));
    mount=max(mount,oval(p,vec2(0.623,0.414),vec2(0.192,0.112)));
    mount=max(mount,oval(p,vec2(0.257,0.486),vec2(0.230,0.060)));
    float blue=smoothstep(0.025,0.18,scan.b-scan.r*0.85);
    float flow=pow(0.5+0.5*sin(p.y*86.0+p.x*19.0+sin(p.x*30.0-t*1.7)*1.7+t*3.9),13.0);
    col+=(1.0-col)*vec3(0.05,0.49,0.67)*mount*blue*flow*0.68;

    if (u_is_foil) {
        // Saturated oil-on-water foil is present even at time zero. Gold
        // armor and scale ridges gain a separate travelling metallic glint.
        float phase=p.x*1.7+p.y*2.7-t*0.10+seed*0.45;
        vec3 hue=0.5+0.5*cos(6.283185*(phase+vec3(0.0,0.33,0.67)));
        vec3 overlay=mix(2.0*col*hue,1.0-2.0*(1.0-col)*(1.0-hue),step(vec3(0.5),col));
        col=mix(col,overlay,0.40);
        float rider=oval(p,vec2(0.392,0.367),vec2(0.19,0.185));
        float metal=clamp(mount*blue+rider*smoothstep(0.015,0.14,scan.r-scan.b),0.0,1.0);
        float light=smoothstep(0.13,0.50,dot(scan.rgb,vec3(0.2126,0.7152,0.0722)));
        float glint=pow(0.5+0.5*sin(p.y*42.0-p.x*24.0-t*2.0),12.0);
        col*=1.0-metal*0.08;
        col+=(1.0-col)*mix(vec3(0.72,0.65,0.26),hue,0.62)*metal*light*(0.20+0.62*glint);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(col,0.0,1.0),art),scan.a);
}
