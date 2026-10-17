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
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/max(dot(v,v),0.000001),0.0,1.0));
}
vec2 wake(float s, float lane) {
    // Two wind streams follow the upper and lower edges of the flying cloak.
    vec2 a=mix(vec2(0.365,0.236),vec2(0.425,0.350),lane);
    vec2 b=mix(vec2(0.651,0.130),vec2(0.680,0.425),lane);
    vec2 c=mix(vec2(0.897,0.227),vec2(0.923,0.302),lane);
    return (1.0-s)*(1.0-s)*a+2.0*s*(1.0-s)*b+s*s*c;
}
void main() {
    vec4 base=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec2 aspect=vec2(1.0,1.4113);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173)*6.2831853;
    float art=smoothstep(0.142,0.153,p.y)*(1.0-smoothstep(0.535,0.547,p.y));
    art*=smoothstep(0.012,0.028,p.x)*(1.0-smoothstep(0.970,0.986,p.x));
    // Shield including its black rim, and every printed strip, remain exact.
    art*=smoothstep(1.0,1.15,length((p-vec2(0.108,0.179))/vec2(0.063,0.044)));
    if (art<=0.0) { gl_FragColor=base; return; }
    vec3 col=base.rgb;
    vec3 wind=vec3(0.13,0.68,0.98);
    vec3 silver=vec3(0.50,0.85,1.0);
    float face=oval(p,vec2(0.307,0.243),vec2(0.053,0.054));
    float cape=oval(p,vec2(0.639,0.275),vec2(0.249,0.112));
    cape*=1.0-face;
    // Deep moving folds lend the broad silhouette readable motion at card size.
    float folds=sin(p.x*25.0+p.y*31.0-t*3.0+seed+sin(p.x*14.0-t)*0.8);
    float sheen=pow(0.5+0.5*folds,4.0);
    col*=1.0+cape*folds*0.22;
    col+=wind*cape*sheen*0.105;

    float streak=0.0;
    float halo=0.0;
    for (int i=0;i<30;i++) {
        float s=float(i)/30.0;
        for (int j=0;j<2;j++) {
            float lane=float(j);
            vec2 a=wake(s,lane);
            vec2 b=wake(s+1.0/30.0,lane);
            float d=segment(p*aspect,a*aspect,b*aspect);
            float head=fract(t*0.48+lane*0.42+seed*0.04);
            float tail=exp(-pow((s-head)*6.5,2.0))*sin(head*3.141593);
            float wave=0.11+tail*0.89;
            streak=max(streak,(1.0-smoothstep(0.001,0.003+aa*0.65,d))*wave);
            halo=max(halo,exp(-d*95.0)*tail);
        }
    }
    col+=wind*(streak*0.72+halo*0.14);

    // Traces drift away from the leap, then vanish: the rogue obscures his trail.
    for (int i=0;i<11;i++) {
        float k=float(i);
        float age=fract(t*0.34+k*0.090909+seed*0.025);
        vec2 c=vec2(0.431+age*0.435,0.510-age*0.133);
        c.y+=sin(k*2.7+age*6.0)*0.025;
        vec2 prev=c-vec2(0.018,0.007)*sin(age*3.141593);
        float d=segment(p*aspect,prev*aspect,c*aspect);
        float spark=1.0-smoothstep(0.0014,0.0038+aa*0.65,d);
        col+=silver*spark*sin(age*3.141593)*0.64;
    }

    // Kunai flashes outward from the already outstretched throwing hand.
    float throwPhase=fract(t*0.72+seed*0.07);
    vec2 start=vec2(0.166,0.277);
    vec2 tip=mix(start,vec2(0.038,0.225),throwPhase);
    vec2 rear=tip+vec2(0.026,0.011);
    float blade=segment(p*aspect,tip*aspect,rear*aspect);
    float bladeLight=(1.0-smoothstep(0.0010,0.0028+aa*0.65,blade))*sin(throwPhase*3.141593);
    float trail=segment(p*aspect,rear*aspect,(rear+vec2(0.045,0.019))*aspect);
    float trailLight=exp(-trail*155.0)*sin(throwPhase*3.141593);
    col+=silver*(bladeLight*0.80+trailLight*0.16);

    // Moonlit tower lamp complements the cold wind without washing out the sky.
    float lamp=oval(p,vec2(0.804,0.413),vec2(0.018,0.019));
    col+=vec3(0.57,0.88,0.94)*lamp*(0.12+0.09*sin(t*2.7+seed));
    if (u_is_foil) {
        float armor=oval(p,vec2(0.344,0.328),vec2(0.125,0.083));
        float leg=oval(p,vec2(0.346,0.448),vec2(0.091,0.101));
        float metal=clamp(cape+armor*0.8+leg*0.65,0.0,1.0)*(1.0-face);
        float phase=p.x*2.25-p.y*3.8+0.09*sin(p.x*19.0+p.y*17.0)-t*0.17+seed*0.08;
        vec3 rainbow=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.333,0.667)));
        float shine=pow(0.5+0.5*sin(phase*6.2831853),6.0);
        // Persistent peacock-metal coating is distinct at t=0 as well.
        col*=1.0-metal*0.19;
        col+=(1.0-col)*mix(vec3(0.25,0.64,0.83),rainbow,0.78)*metal*(0.40+0.47*shine);
        col+=rainbow*streak*0.17;
    }
    gl_FragColor=vec4(mix(base.rgb,clamp(col,0.0,1.0),art),base.a);
}
