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

// Проклятый адмирал: the skull pauldron exhales a weakening curse,
// two waves run around his surviving armour, and his pistol spits sparks.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.45,1.0,length((p-c)/r));
}
float lineDist(vec2 p,vec2 a,vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/max(dot(d,d),0.00001),0.0,1.0));
}
void main() {
    vec4 scan=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    float aa=max(0.0008,0.65/max(u_resolution.x,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.1377)*6.2831853;
    float art=smoothstep(0.141,0.153,p.y)*(1.0-smoothstep(0.531,0.542,p.y));
    art*=smoothstep(0.010,0.027,p.x)*(1.0-smoothstep(0.974,0.993,p.x));
    // Printed anchor armour badge and its overlapping numerical counter.
    art*=smoothstep(1.0,1.15,length((p-vec2(0.110,0.184))/vec2(0.059,0.043)));
    art*=smoothstep(1.0,1.16,length((p-vec2(0.151,0.207))/vec2(0.027,0.021)));
    if (art<=0.0) { gl_FragColor=scan; return; }
    vec3 color=scan.rgb;
    float lum=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
    float shoulder=oval(p,vec2(0.327,0.325),vec2(0.137,0.112));
    float fist=oval(p,vec2(0.657,0.284),vec2(0.094,0.044));
    float cuirass=oval(p,vec2(0.459,0.406),vec2(0.112,0.107));
    float armor=clamp(shoulder+fist+cuirass,0.0,1.0);
    float face=oval(p,vec2(0.483,0.239),vec2(0.080,0.061));

    // The carved red eye remains the source of every curling curse ribbon.
    float pulse=0.55+0.45*sin(t*3.2+seed);
    float eye=oval(p,vec2(0.267,0.310),vec2(0.025,0.014));
    color+=vec3(0.95,0.085,0.018)*eye*(0.32+0.65*pulse);
    float ribbons=0.0;
    float heads=0.0;
    for(int i=0;i<3;i++) {
        float k=float(i);
        float s=fract(t*0.23+k/3.0+seed*0.03);
        float x=mix(0.273,0.054,s);
        float y=0.313+0.092*sin(s*3.7+k*0.47)-0.035*s;
        vec2 head=vec2(x,y);
        heads+=oval(p,head,vec2(0.016,0.010))
               *smoothstep(0.0,0.13,s)*(1.0-smoothstep(0.83,1.0,s));
        float sx=clamp((0.273-p.x)/0.219,0.0,1.0);
        float path=0.313+0.092*sin(sx*3.7+k*0.47)-0.035*sx;
        float tail=smoothstep(s-0.36,s-0.04,sx)*(1.0-smoothstep(s,s+0.05,sx));
        ribbons+=(1.0-smoothstep(0.002,0.006+aa,abs(p.y-path)))
                 *tail*smoothstep(0.03,0.14,sx)*(1.0-smoothstep(0.90,1.0,sx));
    }
    color*=1.0-0.18*ribbons;
    color+=vec3(0.55,0.12,0.66)*ribbons*0.75+vec3(0.96,0.28,0.33)*heads*0.8;

    // Paired red-violet fronts move out across the iron, recalling armour 2.
    float radius=length((p-vec2(0.270,0.310))*vec2(1.0,1.4113));
    float wave=pow(0.5+0.5*cos(radius*61.0-t*4.0+seed),9.0);
    float detail=smoothstep(0.12,0.47,lum);
    color+=(1.0-color)*vec3(0.64,0.14,0.45)*armor*wave*(0.22+0.48*detail);

    // A compact muzzle flare and an actual travelling orange shot trail.
    float shot=fract(t*0.63+0.21+seed*0.03);
    vec2 muzzle=vec2(0.647,0.526);
    vec2 end=muzzle+vec2(0.208,-0.035)*shot;
    vec2 start=muzzle+vec2(0.208,-0.035)*max(0.0,shot-0.22);
    float firing=(1.0-smoothstep(0.42,0.62,shot))*smoothstep(0.0,0.035,shot);
    float trail=(1.0-smoothstep(0.0015,0.0045+aa,lineDist(p,start,end)))*firing;
    float flash=oval(p,muzzle,vec2(0.028,0.019))*(1.0-smoothstep(0.02,0.15,shot));
    color+=vec3(1.0,0.46,0.06)*(trail*0.88+flash*0.75);

    // Smoke and embers rise in the burning fleet behind the admiral's fist.
    float sky=oval(p,vec2(0.890,0.296),vec2(0.150,0.148));
    float smoke=pow(0.5+0.5*sin(p.x*38.0+p.y*21.0+t*1.5+seed),5.0);
    color=mix(color,color*vec3(0.78,0.84,0.92),sky*smoke*0.27);
    for(int i=0;i<8;i++) {
        float k=float(i);
        float rise=fract(t*(0.14+0.009*k)+k*0.137+seed*0.02);
        vec2 ember=vec2(0.803+0.022*k+0.012*sin(rise*8.0+k),0.403-0.19*rise);
        float e=oval(p,ember,vec2(0.0045+aa,0.009));
        e*=sin(rise*3.14159265)*sky;
        color+=vec3(0.97,0.35,0.045)*e*0.75;
    }
    if (u_is_foil) {
        // Dark iridescent steel and copper silk stay readable even at time zero.
        float coat=oval(p,vec2(0.388,0.456),vec2(0.199,0.126));
        float hat=oval(p,vec2(0.428,0.188),vec2(0.169,0.053));
        float finish=clamp(armor*0.95+coat*0.65+hat*0.65+sky*0.40,0.0,1.0)*(1.0-face);
        float phase=p.x*2.6+p.y*3.9+0.18*sin(p.y*25.0)-t*0.19+seed*0.10;
        vec3 rainbow=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        float sheen=pow(0.5+0.5*sin(phase*6.2831853),5.0);
        color*=1.0-finish*0.19;
        color+=(1.0-color)*mix(vec3(0.67,0.52,0.29),rainbow,0.81)
               *finish*(0.34+0.51*sheen);
        color+=rainbow*armor*detail*0.13;
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
