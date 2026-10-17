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

// Эйдерик: two recurring resurrection wakes assemble the spectral mount;
// its eyes and the rider's raised blade share the cemetery's green fire.
// Anchors measured on the base 496x700 WebP, in top-left coordinates.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.25,1.0,length((p-c)/r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.0,1.0));
}
vec2 blade(float f) {
    return mix(vec2(0.854,0.245),vec2(1.008,0.147),f)
        +vec2(0.0025*sin(f*30.0),0.003*sin(f*19.0));
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173)*6.2831853;
    // Keep the class strip, all three ability medallions and counters,
    // skeletal stat-frame fingers, title and rules precisely unchanged.
    float art=smoothstep(0.140,0.153,p.y)*(1.0-smoothstep(0.531,0.543,p.y));
    art*=smoothstep(0.010,0.024,p.x)*(1.0-smoothstep(0.978,0.992,p.x));
    art*=smoothstep(0.056,0.067,length((p-vec2(0.109,0.181))*vec2(1.0,1.4113)));
    art*=smoothstep(0.067,0.078,length((p-vec2(0.119,0.267))*vec2(1.0,1.4113)));
    art*=smoothstep(0.067,0.078,length((p-vec2(0.119,0.346))*vec2(1.0,1.4113)));
    vec3 color=scan.rgb;
    float lum=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
    float pulse=0.5+0.5*sin(t*1.75+seed);
    float horseEye=oval(p,vec2(0.333,0.244),vec2(0.015,0.010));
    float riderEye=oval(p,vec2(0.661,0.257),vec2(0.019,0.008));
    float gaze=horseEye+riderEye;
    color+=(1.0-color)*vec3(0.64,0.91,0.23)*gaze*(0.64+0.36*pulse);
    color+=vec3(0.24,0.36,0.065)*gaze*(0.35+0.65*pulse);

    // The painted weapon edge charges from the gauntlet toward its tip.
    float bladeGlow=0.0;
    float bladeMetal=0.0;
    for(int i=0;i<18;i++) {
        float f=float(i)/18.0;
        float d=segment(p,blade(f),blade(f+1.0/18.0));
        float core=1.0-smoothstep(0.0009,0.0023+aa,d);
        float halo=exp(-d*d/0.00012);
        float flow=0.35+0.65*pow(0.5+0.5*sin(f*10.0-t*3.2+seed),3.0);
        bladeGlow=max(bladeGlow,(core*0.65+halo*0.48)*flow);
        bladeMetal=max(bladeMetal,exp(-d*d/0.00065));
    }
    color+=vec3(0.38,0.50,0.10)*bladeGlow;

    // Two successive wakes rise from the painted grave-fire underneath
    // the horse. Broken ellipses disappear behind the dark mounted body,
    // keeping the effect in the cemetery rather than over the figure.
    float body=oval(p,vec2(0.456,0.405),vec2(0.244,0.103));
    float fire=0.0;
    float mist=0.0;
    for(int i=0;i<2;i++) {
        float k=float(i);
        float life=fract(t*0.14+k*0.5+0.18+seed*0.025);
        vec2 c=vec2(0.471,0.527-life*0.104);
        vec2 q=(p-c)/vec2(0.285+life*0.045,0.041+life*0.013);
        float angle=atan(q.y,q.x);
        float ripple=0.035*sin(angle*9.0-t*1.6+k*2.0)
                    +0.018*sin(angle*17.0+t*2.0);
        float d=abs(length(q)-1.0-ripple);
        float envelope=smoothstep(0.0,0.16,life)*(1.0-smoothstep(0.66,1.0,life));
        float broken=0.35+0.65*smoothstep(-0.6,0.6,sin(angle*5.0-t*0.8+k));
        float front=smoothstep(-0.3,0.4,q.y);
        float visible=(1.0-body*0.94)*(0.35+0.65*front);
        fire+=(1.0-smoothstep(0.025,0.065+aa*8.0,d))*envelope*broken*visible;
        mist+=exp(-d*d/0.035)*envelope*visible;
    }
    color+=vec3(0.24,0.40,0.13)*fire;
    color+=(1.0-color)*vec3(0.13,0.24,0.12)*mist;

    // Existing green flames climb through the leg gaps; their painted
    // yellow-green pigment supplies the irregular flame silhouette.
    float ground=oval(p,vec2(0.474,0.493),vec2(0.422,0.109));
    float green=smoothstep(0.015,0.14,scan.g-scan.b)*smoothstep(0.16,0.52,lum);
    float tongues=0.5+0.5*sin(p.y*72.0+p.x*14.0
                  +2.3*sin(p.x*31.0-t*0.60)+t*2.6+seed);
    color+=(1.0-color)*vec3(0.17,0.26,0.045)*ground*green*(0.28+0.72*tongues);
    float embers=0.0;
    for(int i=0;i<8;i++) {
        float k=float(i);
        float life=fract(t*(0.12+0.008*mod(k,3.0))+k*0.127+seed*0.017);
        vec2 pos=vec2(0.17+k*0.092+0.020*sin(life*8.0+k*2.1),0.528-life*0.138);
        vec2 q=(p-pos)*vec2(1.0,1.4113);
        float d=length(q);
        float fade=sin(life*3.14159265);
        embers+=(1.0-smoothstep(0.0011,0.0036+aa,d))*fade*(1.0-body*0.90);
    }
    color+=vec3(0.47,0.63,0.19)*embers;

    if(u_is_foil) {
        // Broad interference follows skull, barding and steel armour.
        // A permanent pearlescent lift makes the finish readable at t=0.
        float skull=oval(p,vec2(0.325,0.270),vec2(0.123,0.086));
        float armour=oval(p,vec2(0.665,0.337),vec2(0.180,0.105));
        float mount=oval(p,vec2(0.420,0.408),vec2(0.235,0.141));
        float face=oval(p,vec2(0.655,0.272),vec2(0.035,0.027));
        float finish=clamp(0.25+skull*0.45+armour*0.58+mount*0.29+bladeMetal*0.40,0.0,0.95);
        finish*=1.0-face*0.65;
        float field=p.x*2.3+p.y*2.9+0.13*sin(p.x*17.0-p.y*15.0)+t*0.095+seed*0.07;
        vec3 pearl=0.5+0.5*cos(6.2831853*(field+vec3(0.0,0.333,0.667)));
        vec3 coat=mix(2.0*color*pearl,1.0-2.0*(1.0-color)*(1.0-pearl),step(vec3(0.5),color));
        color=mix(color,coat,finish*0.57);
        float sheen=pow(0.5+0.5*sin(p.x*19.0+p.y*11.0-t*1.3+seed),7.0);
        color+=(1.0-color)*(vec3(0.045,0.055,0.045)+pearl*0.19)*finish;
        color+=(1.0-color)*mix(vec3(0.80,0.98,0.74),pearl,0.48)*sheen*finish*0.35;
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
