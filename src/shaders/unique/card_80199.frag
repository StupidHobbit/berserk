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
    return 1.0-smoothstep(0.35,1.0,length((p-c)/r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/max(dot(d,d),0.000001),0.0,1.0));
}
vec2 blessing(float s, float side) {
    vec2 a=vec2(0.713,0.211);
    vec2 b=mix(vec2(0.125,0.296),vec2(0.950,0.329),side);
    vec2 c=mix(vec2(0.188,0.506),vec2(0.824,0.518),side);
    return (1.0-s)*(1.0-s)*a+2.0*(1.0-s)*s*b+s*s*c;
}

void main() {
    vec4 base=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.1517)*6.2831853;
    float art=smoothstep(0.140,0.153,p.y)*(1.0-smoothstep(0.542,0.557,p.y));
    art*=smoothstep(0.018,0.035,p.x)*(1.0-smoothstep(0.965,0.982,p.x));
    // Shield, printed armor badge and its small numeral retain original ink.
    art*=smoothstep(1.0,1.12,length((p-vec2(0.108,0.181))/vec2(0.065,0.046)));
    art*=smoothstep(1.0,1.15,length((p-vec2(0.151,0.207))/vec2(0.024,0.018)));
    if (art<=0.0) { gl_FragColor=base; return; }
    vec3 color=base.rgb;
    float lum=dot(base.rgb,vec3(0.2126,0.7152,0.0722));
    vec3 gold=vec3(1.0,0.71,0.24);
    vec2 aspect=vec2(1.0,1.4113);

    // His painted solar crown breathes and sends short rays out behind the head.
    vec2 h=(p-vec2(0.535,0.235))*aspect;
    float hr=length(h);
    float ha=atan(h.y,h.x);
    float face=oval(p,vec2(0.536,0.260),vec2(0.047,0.035));
    float beat=0.55+0.45*sin(t*1.8+seed);
    float crown=(1.0-smoothstep(0.002,0.008+aa,abs(hr-0.058)))*(1.0-face);
    float rays=pow(0.5+0.5*cos(ha*13.0+0.19*sin(t*0.8+seed)),10.0);
    rays*=smoothstep(0.041,0.060,hr)*(1.0-smoothstep(0.072,0.110,hr));
    float crownGlow=exp(-abs(hr-0.058)*65.0)*(1.0-face);
    color+=gold*(crown*(0.15+0.17*beat)+rays*(0.14+0.19*beat)+crownGlow*0.055);

    // Pearl light runs outward from the shoulders along the existing feather fans.
    float leftWing=oval(p,vec2(0.254,0.278),vec2(0.249,0.121));
    float rightWing=oval(p,vec2(0.815,0.308),vec2(0.210,0.157));
    float feather=smoothstep(-0.025,0.105,base.b-base.r*0.84)*smoothstep(0.20,0.64,lum);
    float wings=clamp(leftWing+rightWing,0.0,1.0)*feather*(1.0-face);
    float rootDist=length((p-vec2(0.535,0.309))*aspect);
    float featherWave=pow(0.5+0.5*sin(rootDist*31.0-t*2.2+seed),5.0);
    color+=(1.0-color)*vec3(0.65,0.84,1.0)*wings*(0.10+0.44*featherWave);

    // Two travelling blessings represent the two conversions into magic strikes.
    // They begin at the raised hand and descend towards the foreground warriors.
    float streams=0.0;
    float crests=0.0;
    float seals=0.0;
    for (int sideIndex=0;sideIndex<2;sideIndex++) {
        float side=float(sideIndex);
        float packet=fract(t*0.22+side*0.5+seed*0.075);
        float life=sin(packet*3.14159265);
        for (int j=0;j<24;j++) {
            float s=float(j)/24.0;
            float d=segment(p*aspect,blessing(s,side)*aspect,blessing(s+1.0/24.0,side)*aspect);
            float line=1.0-smoothstep(0.0008,0.0023+aa,d);
            float envelope=exp(-pow((s-packet)*12.0,2.0))*life;
            streams=max(streams,line*envelope);
            crests=max(crests,exp(-d*160.0)*envelope);
        }
        vec2 target=mix(vec2(0.188,0.506),vec2(0.824,0.518),side);
        vec2 q=(p-target)*vec2(1.0,3.0);
        float ringRadius=0.024+packet*0.040;
        float ring=1.0-smoothstep(0.0010,0.003+aa,abs(length(q)-ringRadius));
        float arrival=pow(packet,3.0)*(1.0-smoothstep(0.88,1.0,packet));
        seals+=ring*arrival;
        float cross=min(segment(q,vec2(-0.012,0.0),vec2(0.012,0.0)),
                        segment(q,vec2(0.0,-0.016),vec2(0.0,0.016)));
        seals+=(1.0-smoothstep(0.001,0.003+aa,cross))*(0.16+arrival);
    }
    color+=gold*(streams*0.70+crests*0.20);
    color+=vec3(0.67,1.0,0.69)*seals*0.65;

    float hand=oval(p,vec2(0.713,0.211),vec2(0.041,0.043));
    float staff=oval(p,vec2(0.205,0.157),vec2(0.034,0.055));
    color+=gold*(hand*(0.12+0.18*beat)+staff*(0.08+0.17*(1.0-beat)));

    if (u_is_foil) {
        // A substantial silver-gold diffraction finish follows feathers and plate.
        float plate=oval(p,vec2(0.495,0.355),vec2(0.105,0.103));
        plate+=oval(p,vec2(0.605,0.315),vec2(0.059,0.065));
        plate+=oval(p,vec2(0.408,0.458),vec2(0.063,0.078));
        float metal=clamp(wings*1.18+plate*smoothstep(0.10,0.52,lum),0.0,1.0);
        metal*=1.0-face;
        float phase=p.x*2.5-p.y*3.9-t*0.19+seed*0.12;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        float shine=pow(0.5+0.5*sin(phase*6.2831853),6.0);
        float engraved=0.82+0.18*sin(rootDist*185.0+ha*8.0);
        color*=1.0-metal*0.19;
        color+=(1.0-color)*mix(vec3(0.89,0.89,0.77),spectrum,0.76)
               *metal*(0.37+shine*0.65)*engraved;
        color+=spectrum*(crown*0.17+streams*0.12);
        // Low-strength foil substrate remains recognizable at compact size;
        // the card-specific metallic details above keep their stronger highlights.
        vec3 finishHue = 0.5 + 0.5*cos(6.2831853*(p.x*1.4+p.y*0.9-t*0.12+seed*0.07+vec3(0.0,0.33,0.67)));
        vec3 finishOverlay = mix(2.0*color*finishHue,
            1.0-2.0*(1.0-color)*(1.0-finishHue),step(vec3(0.5),color));
        color = mix(color,finishOverlay,0.25);

    }
    gl_FragColor=vec4(mix(base.rgb,clamp(color,0.0,1.0),art),base.a);
}
