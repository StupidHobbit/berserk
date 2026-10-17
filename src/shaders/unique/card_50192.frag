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

// Fallen Linnet: the discharge gathers in her open palms and runs upward
// through the two orange fire trails already painted behind the priestess.
// All anchors refer to the original 496 x 700 WebP, measured from top left.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.15,1.0,length((p-c)/r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.0,1.0));
}
vec2 discharge(float f, float side, float t) {
    vec2 a=mix(vec2(0.253,0.517),vec2(0.776,0.514),side);
    vec2 b=mix(vec2(0.146,0.415),vec2(0.912,0.366),side);
    vec2 c=mix(vec2(0.166,0.324),vec2(0.711,0.210),side);
    vec2 q=(1.0-f)*(1.0-f)*a+2.0*f*(1.0-f)*b+f*f*c;
    q.x+=sin(f*3.141593)*(0.006*sin(f*34.0+t*1.8+side*4.0)
                         +0.003*sin(f*63.0-t*2.1));
    return q;
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 base=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173)*6.2831853;
    // Title, shield, the entire lower stat frame and text retain base pixels.
    float art=smoothstep(0.143,0.154,p.y)*(1.0-smoothstep(0.545,0.556,p.y));
    art*=smoothstep(0.012,0.025,p.x)*(1.0-smoothstep(0.975,0.988,p.x));
    art*=smoothstep(0.057,0.068,length((p-vec2(0.109,0.180))*vec2(1.0,1.4113)));
    art*=smoothstep(0.114,0.141,length((p-vec2(0.119,0.604))*vec2(1.0,1.4113)));
    art*=smoothstep(0.114,0.141,length((p-vec2(0.879,0.604))*vec2(1.0,1.4113)));
    vec3 col=base.rgb;
    float lum=dot(base.rgb,vec3(0.2126,0.7152,0.0722));
    float pulse=0.5+0.5*sin(t*2.1+seed);
    float face=oval(p,vec2(0.510,0.229),vec2(0.068,0.057));
    float figure=oval(p,vec2(0.515,0.409),vec2(0.221,0.220));
    vec3 flame=vec3(1.0,0.26,0.025);
    vec3 hot=vec3(1.0,0.73,0.29);

    // A continuous dim thread remains visible at rest. Bright knots travel
    // from the hands outward, like successive charges of her ranged attack.
    float arc=0.0;
    float arcHaze=0.0;
    for(int i=0;i<30;i++) {
        float k=float(i);
        float side=step(15.0,k);
        float f=mod(k,15.0)/15.0;
        float d=segment(p,discharge(f,side,t+seed),discharge(f+1.0/15.0,side,t+seed));
        float flow=0.30+0.70*pow(0.5+0.5*cos(f*13.0-t*3.5+side*1.8+seed),4.0);
        float tail=1.0-smoothstep(0.76,1.02,f);
        arc=max(arc,(1.0-smoothstep(0.0009,0.0030+aa*0.65,d))*flow*tail);
        arcHaze=max(arcHaze,exp(-d*d/0.00035)*flow*tail);
    }
    col+=hot*arc*0.66;
    col+=(1.0-col)*flame*arcHaze*0.42;
    float palms=oval(p,vec2(0.253,0.517),vec2(0.041,0.025))
               +oval(p,vec2(0.776,0.514),vec2(0.043,0.026));
    col+=(1.0-col)*hot*palms*(0.32+0.28*pulse);

    // Animate the original fire pigment without moving the scanned card.
    float leftFire=oval(p,vec2(0.235,0.429),vec2(0.120,0.134));
    float rightFire=oval(p,vec2(0.784,0.357),vec2(0.122,0.171));
    float orange=smoothstep(0.06,0.25,base.r-base.b)*smoothstep(0.07,0.20,base.g);
    float rising=0.5+0.5*sin(p.y*67.0+t*3.2+2.0*sin(p.x*37.0-t*0.7)+seed);
    col+=(1.0-col)*vec3(0.58,0.22,0.025)*(leftFire+rightFire)*orange*(0.20+0.55*rising)*(1.0-figure*0.72);
    float sparks=0.0;
    for(int i=0;i<10;i++) {
        float k=float(i);
        float side=step(5.0,k);
        float life=fract(t*(0.13+0.009*mod(k,3.0))+k*0.197+seed*0.021);
        vec2 pos=discharge(life,side,t+seed);
        pos.x+=sin(k*2.9+life*5.0)*(0.022+life*0.040);
        pos.y+=0.012*cos(k*3.7);
        vec2 q=(p-pos)*vec2(1.0,1.4113);
        float d=length(q);
        float lifeFade=smoothstep(0.0,0.15,life)*(1.0-smoothstep(0.75,1.0,life));
        sparks+=(1.0-smoothstep(0.0010,0.0033+aa*0.6,d))*lifeFade;
    }
    col+=hot*sparks*0.68*(1.0-figure*0.82);
    float crown=oval(p,vec2(0.564,0.182),vec2(0.121,0.056));
    float gold=smoothstep(0.04,0.17,base.r-base.b)*smoothstep(0.20,0.52,lum);
    col+=(1.0-col)*hot*crown*gold*(0.11+0.14*pulse);

    if(u_is_foil) {
        // Broad scarlet/gold metal interference follows hair, dress and
        // shoulder plates. The spatial finish is fully present at time zero.
        float dress=oval(p,vec2(0.500,0.425),vec2(0.272,0.217));
        float hair=oval(p,vec2(0.527,0.285),vec2(0.235,0.132));
        float red=smoothstep(0.035,0.19,base.r-base.g);
        float finish=clamp(0.15+red*(dress*0.61+hair*0.41)+crown*0.63+gold*dress*0.28,0.0,0.95);
        finish*=1.0-face*0.91;
        float field=p.y*3.8+abs(p.x-0.52)*2.1+0.065*sin(p.x*27.0-p.y*19.0)+t*0.085+seed*0.06;
        vec3 pearl=0.5+0.5*cos(6.2831853*(field+vec3(0.0,0.333,0.667)));
        vec3 coat=mix(2.0*col*pearl,1.0-2.0*(1.0-col)*(1.0-pearl),step(vec3(0.5),col));
        col=mix(col,coat,finish*0.53);
        float sheen=pow(0.5+0.5*sin(field*11.0-t*1.3),7.0);
        col+=(1.0-col)*(vec3(0.07,0.04,0.015)+pearl*0.22)*finish;
        col+=(1.0-col)*mix(vec3(1.0,0.81,0.48),pearl,0.47)*sheen*finish*0.42;
    }
    gl_FragColor=vec4(mix(base.rgb,clamp(col,0.0,1.0),art),base.a);
}
