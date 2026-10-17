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

// Grykh: three meals of forest detritus spiral into the painted toothed maw.
// Top-left scan coordinates; the three printed badges are outside the mask.
float oval(vec2 p,vec2 c,vec2 r) {
    return 1.0-smoothstep(0.55,1.0,length((p-c)/r));
}
float rnd(float x) { return fract(sin(x*127.1+31.7)*43758.5453); }
float stroke(vec2 p,vec2 a,vec2 b) {
    vec2 q=b-a;
    return length(p-a-q*clamp(dot(p-a,q)/dot(q,q),0.0,1.0));
}
vec2 meal(float f,float lane) {
    vec2 source=vec2(0.29,0.49);
    vec2 control=vec2(0.29,0.29);
    if(lane>0.5) { source=vec2(0.785,0.368); control=vec2(0.76,0.245); }
    if(lane>1.5) { source=vec2(0.817,0.292); control=vec2(0.73,0.20); }
    return (1.0-f)*(1.0-f)*source+2.0*f*(1.0-f)*control+f*f*vec2(0.561,0.248);
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 original=texture2D(u_card,v_uv);
    float aa=max(0.00065,1.0/max(u_resolution.x,1.0));
    float t=u_time;
    float seed=u_seed*0.139;
    float art=smoothstep(0.140,0.156,p.y)*(1.0-smoothstep(0.538,0.557,p.y));
    art*=smoothstep(0.012,0.031,p.x)*(1.0-smoothstep(0.968,0.988,p.x));
    art*=clamp(smoothstep(0.177,0.203,p.x)+smoothstep(0.375,0.399,p.y),0.0,1.0);

    float cycle=t*0.145+seed;
    float hunger=0.5+0.5*sin(cycle*6.2831853);
    float swallow=pow(0.5+0.5*sin(cycle*18.849556-1.1),8.0);
    float throat=oval(p,vec2(0.555,0.296),vec2(0.081,0.052));
    float moss=oval(p,vec2(0.484,0.396),vec2(0.165,0.146));
    // Only the throat and hanging moss breathe. No camera or scan movement.
    vec2 delta=vec2(0.0009*sin(t*1.8+p.y*45.0),0.0014*sin(t*2.3-p.y*24.0))*moss;
    delta.y+=throat*0.0026*swallow;
    delta*=art;
    vec3 col=texture2D(u_card,v_uv+vec2(delta.x,-delta.y)).rgb;
    float light=dot(original.rgb,vec3(0.299,0.587,0.114));
    float vegetation=smoothstep(0.02,0.16,original.g-original.b);
    float mouth=oval(p,vec2(0.557,0.248),vec2(0.092,0.025));
    float dark=1.0-smoothstep(0.10,0.34,light);
    col*=1.0-mouth*dark*(0.10+0.23*hunger);
    // The grin's existing teeth acquire a moist ivory glint as each meal lands.
    float teeth=mouth*smoothstep(0.22,0.52,light);
    col+=vec3(0.15,0.18,0.045)*teeth*(0.25+swallow*0.75);
    col+=vec3(0.075,0.065,0.008)*throat*swallow;
    float eye=oval(p,vec2(0.574,0.216),vec2(0.016,0.011));
    col+=vec3(0.28,0.29,0.025)*eye*(0.35+0.65*hunger);

    float flecks=0.0;
    float dust=0.0;
    float cores=0.0;
    for(int i=0;i<27;i++) {
        float fi=float(i);
        float lane=mod(fi,3.0);
        float a=fract(cycle+floor(fi/3.0)*0.1109+lane*0.235);
        float speed=a*a*(3.0-2.0*a);
        vec2 c=meal(speed,lane);
        float curl=sin(a*3.141593)*(1.0-a);
        c+=vec2(sin(a*16.0+fi*2.3),cos(a*13.0+fi))*curl*0.020;
        vec2 q=p-c;
        q.y*=1.41;
        float size=mix(0.0036,0.0011,a)*(0.75+rnd(fi+seed)*0.5);
        float envelope=smoothstep(0.015,0.14,a)*(1.0-smoothstep(0.91,1.0,a));
        float angle=t*1.9+fi*2.1;
        vec2 rotated=vec2(q.x*cos(angle)-q.y*sin(angle),q.x*sin(angle)+q.y*cos(angle));
        float d=length(rotated*vec2(0.70,1.8));
        flecks+=(1.0-smoothstep(size,size+aa,d))*envelope;
        dust+=exp(-dot(q,q)/0.000045)*envelope*0.11;
        cores+=(1.0-smoothstep(size*0.18,size*0.18+aa,length(q)))*envelope;
    }
    // Small ochre leaf fragments and luminous spores, never flesh or blood.
    col=mix(col,vec3(0.13,0.18,0.025),clamp(flecks*0.62,0.0,0.7));
    col+=vec3(0.42,0.38,0.075)*dust+vec3(0.43,0.49,0.12)*cores*0.60;

    // The two insects already painted at right tremble their translucent wings.
    float flyA=oval(p,vec2(0.792,0.294),vec2(0.039,0.021));
    float flyB=oval(p,vec2(0.796,0.366),vec2(0.038,0.025));
    float flutter=0.5+0.5*sin(t*26.0+seed);
    col+=vec3(0.12,0.18,0.085)*(flyA+flyB)*vegetation*flutter;
    float sap=pow(0.5+0.5*sin(p.y*80.0-t*3.0+seed),10.0);
    col+=vec3(0.045,0.075,0.012)*moss*vegetation*sap;

    if(u_is_foil) {
        // Metallic coating follows the moss, the long fingers, and enamel teeth.
        float fingers=1.0-smoothstep(0.008,0.025,
            stroke(p,vec2(0.625,0.384),vec2(0.565,0.548)));
        float coating=clamp(moss*vegetation+mouth*0.65+fingers*0.70,0.0,1.0);
        float phase=p.x*3.7+p.y*4.0-t*0.19+seed+sin(p.y*39.0)*0.10;
        vec3 iridescence=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.32,0.63)));
        float ridge=smoothstep(0.16,0.52,light);
        float shine=pow(0.5+0.5*sin(p.x*19.0-p.y*12.0-t*1.65),13.0);
        col+=coating*ridge*(iridescence*0.17+(vec3(0.61,0.67,0.33)+iridescence*0.6)*shine*0.31);
        col+=cores*iridescence*0.28;
        // A restrained full-art foil substrate keeps the edition recognizable
        // at listing size; the stronger, art-specific metal highlights remain above.
        vec3 finishHue = 0.5 + 0.5*cos(6.2831853*(p.x*1.4+p.y*0.9-t*0.12+seed*0.07+vec3(0.0,0.33,0.67)));
        vec3 finishOverlay = mix(2.0*col*finishHue,
            1.0-2.0*(1.0-col)*(1.0-finishHue),step(vec3(0.5),col));
        col = mix(col,finishOverlay,0.28);
    }
    gl_FragColor=vec4(mix(original.rgb,clamp(col,0.0,1.0),art),original.a);
}
