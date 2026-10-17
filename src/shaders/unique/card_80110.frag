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
float hash(float v) { return fract(sin(v*127.1+31.7)*43758.5453); }
vec2 drain(float f,float branch) {
    vec2 a=branch<0.5?vec2(0.135,0.470):(branch<1.5?vec2(0.907,0.475):vec2(0.854,0.218));
    vec2 b=branch<0.5?vec2(0.230,0.544):(branch<1.5?vec2(0.740,0.540):vec2(0.756,0.355));
    vec2 c=vec2(0.424,0.405);
    return (1.0-f)*(1.0-f)*a+2.0*f*(1.0-f)*b+f*f*c;
}

void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t=u_time;
    float seed=u_seed*0.113;
    // The two upper-left printed abilities and their counters stay untouched.
    float art=smoothstep(0.141,0.155,p.y)*(1.0-smoothstep(0.542,0.553,p.y));
    art*=smoothstep(0.006,0.023,p.x)*(1.0-smoothstep(0.980,0.994,p.x));
    art*=clamp(smoothstep(0.177,0.202,p.x)+smoothstep(0.304,0.322,p.y),0.0,1.0);
    vec3 col=scan.rgb;

    // Three currents of rot drain surrounding ground into the burning trunk:
    // the card's accumulating decay damages neighbours and restores its life.
    float trails=0.0;
    float cores=0.0;
    for (int i=0;i<24;i++) {
        float fi=float(i);
        float branch=floor(fi/8.0);
        float part=mod(fi,8.0);
        float f=fract(t*0.235+branch*0.291+seed-part*0.022);
        vec2 q=drain(f,branch);
        q+=vec2(sin(f*12.0+branch*4.0),cos(f*15.0+branch))*0.011*sin(f*3.141593);
        float d=length((p-q)*vec2(1.0,0.71));
        float envelope=smoothstep(0.0,0.11,f)*(1.0-smoothstep(0.86,1.0,f));
        float tail=(1.0-part/9.0)*envelope;
        trails+=exp(-d*d/0.00025)*tail*0.19;
        cores+=(1.0-smoothstep(0.003,0.005+aa,d))*tail;
    }
    col+=vec3(0.035,0.32,0.15)*trails;
    col+=vec3(0.23,0.66,0.12)*cores*0.72;

    // Poison seeps along the actual curling right-hand root and its tiny face.
    float root=oval(p,vec2(0.737,0.453),vec2(0.130,0.105));
    float rotPaint=smoothstep(0.015,0.14,scan.g-scan.r);
    float sap=pow(0.5+0.5*sin(p.y*76.0-p.x*17.0+t*4.7),3.0);
    col+=vec3(0.025,0.31,0.12)*rotPaint*root*(0.25+sap);
    float head=oval(p,vec2(0.671,0.377),vec2(0.021,0.018));
    head+=oval(p,vec2(0.276,0.481),vec2(0.035,0.029));
    head+=oval(p,vec2(0.943,0.261),vec2(0.020,0.015));
    col+=vec3(0.34,0.12,0.012)*head*(0.4+0.6*sin(t*2.1+1.0)*sin(t*2.1+1.0));

    // Flame inside the open wooden maw surges upward, retaining dark bark.
    float mouth=oval(p,vec2(0.416,0.405),vec2(0.122,0.090));
    float heat=smoothstep(0.09,0.38,scan.r-scan.b);
    float flame=0.50+0.30*sin(p.y*107.0+t*8.2+sin(p.x*67.0-t*3.0))
                    +0.20*sin(t*13.1+p.x*91.0);
    col+=vec3(0.34,0.11,0.004)*mouth*heat*flame;
    float eyes=oval(p,vec2(0.449,0.252),vec2(0.027,0.027))
              +oval(p,vec2(0.540,0.308),vec2(0.033,0.018));
    col+=vec3(0.44,0.15,0.009)*eyes*(0.35+0.65*pow(0.5+0.5*sin(t*3.1+seed),3.0));
    for (int i=0;i<12;i++) {
        float fi=float(i);
        float f=fract(t*(0.22+0.10*hash(fi))+hash(fi+20.0)+seed);
        vec2 q=vec2(0.396+(hash(fi+8.0)-0.5)*0.10+sin(f*7.0+fi)*0.017,
                    0.456-f*0.196);
        float d=length((p-q)*vec2(1.0,0.71));
        float ember=(1.0-smoothstep(0.0018,0.0035+aa,d))*sin(f*3.141593);
        col+=vec3(0.85,0.28,0.025)*ember*0.65;
    }

    if (u_is_foil) {
        // Oil-slick copper and emerald across bark, visible even at time zero.
        float lum=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
        float phase=p.x*2.5+p.y*3.1+0.12*sin(p.y*39.0+p.x*21.0)+t*0.12+seed;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.03,0.35,0.66)));
        float coat=0.27+0.20*smoothstep(0.05,0.32,lum);
        vec3 metal=col*(0.60+1.20*spectrum)+spectrum*0.075;
        col=mix(col,metal,coat*(1.0-heat*mouth*0.75));
        float ridge=pow(0.5+0.5*sin(p.x*31.0-p.y*17.0+sin(p.y*53.0)*1.8-t*1.7),13.0);
        col+=mix(vec3(0.17,0.31,0.14),spectrum,0.55)*ridge
             *(0.08+0.26*smoothstep(0.08,0.33,lum));
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(col,0.0,1.0),art),scan.a);
}
